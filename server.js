const express = require('express');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      picture TEXT,
      goal_weight REAL,
      goal_2k REAL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Erg practice table (multiple entries per day allowed)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ergpractice (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL,
      minutes REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: add goal columns if missing
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS goal_weight REAL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS goal_2k REAL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS goal_weekly_erg REAL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_dismissed BOOLEAN NOT NULL DEFAULT FALSE`);
    // Existing users with any goal set have effectively already seen/used
    // the app — mark their welcome as dismissed so they don't get prompted.
    await pool.query(`
      UPDATE users SET welcome_dismissed = TRUE
      WHERE welcome_dismissed = FALSE
        AND (goal_weight IS NOT NULL OR goal_2k IS NOT NULL OR goal_weekly_erg IS NOT NULL)
    `);
  } catch (e) { /* ignore */ }

  // Weights table (with user_id)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL,
      weight REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, date)
    )
  `);

  // Erg times table (with user_id)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ergtimes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL,
      time_seconds REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, date)
    )
  `);

  // Migration: add user_id column and fix constraints if tables already exist
  try {
    await pool.query(`ALTER TABLE weights ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`);
    await pool.query(`ALTER TABLE ergtimes ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`);
    // Drop old unique constraint on date alone (if exists)
    await pool.query(`ALTER TABLE weights DROP CONSTRAINT IF EXISTS weights_date_key`);
    await pool.query(`ALTER TABLE ergtimes DROP CONSTRAINT IF EXISTS ergtimes_date_key`);
    // Delete any old entries without a user_id (orphaned data)
    await pool.query(`DELETE FROM weights WHERE user_id IS NULL`);
    await pool.query(`DELETE FROM ergtimes WHERE user_id IS NULL`);
    // Add composite unique if not exists
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weights_user_id_date_key') THEN
          ALTER TABLE weights ADD CONSTRAINT weights_user_id_date_key UNIQUE (user_id, date);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ergtimes_user_id_date_key') THEN
          ALTER TABLE ergtimes ADD CONSTRAINT ergtimes_user_id_date_key UNIQUE (user_id, date);
        END IF;
      END $$;
    `);
  } catch (e) { console.log('Migration note:', e.message); }

  console.log('Database tables ready');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth Middleware ----

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---- Auth Routes ----

app.get('/api/auth/config', (req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Credential required' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Upsert user
    const { rows } = await pool.query(`
      INSERT INTO users (google_id, email, name, picture)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT(google_id) DO UPDATE SET email = $2, name = $3, picture = $4
      RETURNING *
    `, [googleId, email, name || '', picture || '']);

    const user = rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, picture: user.picture }
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, picture FROM users WHERE id = $1', [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// ---- Goals API ----
app.get('/api/goals', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT goal_weight, goal_2k, goal_weekly_erg, welcome_dismissed FROM users WHERE id = $1',
    [req.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

app.put('/api/goals', requireAuth, async (req, res) => {
  const { goal_weight, goal_2k, goal_weekly_erg } = req.body;
  await pool.query(
    'UPDATE users SET goal_weight = $1, goal_2k = $2, goal_weekly_erg = $3 WHERE id = $4',
    [goal_weight ?? null, goal_2k ?? null, goal_weekly_erg ?? null, req.userId]
  );
  res.json({ success: true });
});

app.post('/api/welcome/dismiss', requireAuth, async (req, res) => {
  await pool.query('UPDATE users SET welcome_dismissed = TRUE WHERE id = $1', [req.userId]);
  res.json({ success: true });
});

// ---- Weight API ----

app.get('/api/weights', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM weights WHERE user_id = $1 ORDER BY date ASC', [req.userId]);
  res.json(rows);
});

app.post('/api/weights', requireAuth, async (req, res) => {
  const { date, weight } = req.body;
  if (!date || weight == null) return res.status(400).json({ error: 'Date and weight are required' });
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  const { rows } = await pool.query(`
    INSERT INTO weights (user_id, date, weight) VALUES ($1, $2, $3)
    ON CONFLICT(user_id, date) DO UPDATE SET weight = EXCLUDED.weight
    RETURNING *
  `, [req.userId, date, w]);
  res.json(rows[0]);
});

app.put('/api/weights/:id', requireAuth, async (req, res) => {
  const { weight } = req.body;
  const { id } = req.params;
  if (weight == null) return res.status(400).json({ error: 'Weight is required' });
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  const { rows } = await pool.query('UPDATE weights SET weight = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [w, id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(rows[0]);
});

app.delete('/api/weights/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM weights WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// ---- 2K Erg Time API ----

app.get('/api/ergtimes', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ergtimes WHERE user_id = $1 ORDER BY date ASC', [req.userId]);
  res.json(rows);
});

app.post('/api/ergtimes', requireAuth, async (req, res) => {
  const { date, time_seconds } = req.body;
  if (!date || time_seconds == null) return res.status(400).json({ error: 'Date and time are required' });
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  const { rows } = await pool.query(`
    INSERT INTO ergtimes (user_id, date, time_seconds) VALUES ($1, $2, $3)
    ON CONFLICT(user_id, date) DO UPDATE SET time_seconds = EXCLUDED.time_seconds
    RETURNING *
  `, [req.userId, date, t]);
  res.json(rows[0]);
});

app.put('/api/ergtimes/:id', requireAuth, async (req, res) => {
  const { time_seconds } = req.body;
  const { id } = req.params;
  if (time_seconds == null) return res.status(400).json({ error: 'Time is required' });
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  const { rows } = await pool.query('UPDATE ergtimes SET time_seconds = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [t, id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(rows[0]);
});

app.delete('/api/ergtimes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM ergtimes WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// ---- Erg Practice API ----

app.get('/api/ergpractice', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ergpractice WHERE user_id = $1 ORDER BY date ASC, created_at ASC', [req.userId]);
  res.json(rows);
});

app.post('/api/ergpractice', requireAuth, async (req, res) => {
  const { date, minutes } = req.body;
  if (!date || minutes == null) return res.status(400).json({ error: 'Date and minutes are required' });
  const m = parseFloat(minutes);
  if (isNaN(m) || m <= 0 || m > 1440) return res.status(400).json({ error: 'Minutes must be between 0 and 1440' });
  const { rows } = await pool.query(
    'INSERT INTO ergpractice (user_id, date, minutes) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, date, m]
  );
  res.json(rows[0]);
});

app.delete('/api/ergpractice/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM ergpractice WHERE id = $1 AND user_id = $2', [id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Project2k is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
