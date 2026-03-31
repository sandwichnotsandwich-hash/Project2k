const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup — uses Railway's DATABASE_URL in production, local PostgreSQL in dev
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weights (
      id SERIAL PRIMARY KEY,
      date TEXT UNIQUE NOT NULL,
      weight REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ergtimes (
      id SERIAL PRIMARY KEY,
      date TEXT UNIQUE NOT NULL,
      time_seconds REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database tables ready');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Weight API ----

app.get('/api/weights', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM weights ORDER BY date ASC');
  res.json(rows);
});

app.post('/api/weights', async (req, res) => {
  const { date, weight } = req.body;
  if (!date || weight == null) {
    return res.status(400).json({ error: 'Date and weight are required' });
  }
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) {
    return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  }
  const { rows } = await pool.query(`
    INSERT INTO weights (date, weight) VALUES ($1, $2)
    ON CONFLICT(date) DO UPDATE SET weight = EXCLUDED.weight
    RETURNING *
  `, [date, w]);
  res.json(rows[0]);
});

app.put('/api/weights/:id', async (req, res) => {
  const { weight } = req.body;
  const { id } = req.params;
  if (weight == null) {
    return res.status(400).json({ error: 'Weight is required' });
  }
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) {
    return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  }
  const { rows } = await pool.query('UPDATE weights SET weight = $1 WHERE id = $2 RETURNING *', [w, id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json(rows[0]);
});

app.delete('/api/weights/:id', async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM weights WHERE id = $1', [id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json({ success: true });
});

// ---- 2K Erg Time API ----

app.get('/api/ergtimes', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM ergtimes ORDER BY date ASC');
  res.json(rows);
});

app.post('/api/ergtimes', async (req, res) => {
  const { date, time_seconds } = req.body;
  if (!date || time_seconds == null) {
    return res.status(400).json({ error: 'Date and time are required' });
  }
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) {
    return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  }
  const { rows } = await pool.query(`
    INSERT INTO ergtimes (date, time_seconds) VALUES ($1, $2)
    ON CONFLICT(date) DO UPDATE SET time_seconds = EXCLUDED.time_seconds
    RETURNING *
  `, [date, t]);
  res.json(rows[0]);
});

app.put('/api/ergtimes/:id', async (req, res) => {
  const { time_seconds } = req.body;
  const { id } = req.params;
  if (time_seconds == null) {
    return res.status(400).json({ error: 'Time is required' });
  }
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) {
    return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  }
  const { rows } = await pool.query('UPDATE ergtimes SET time_seconds = $1 WHERE id = $2 RETURNING *', [t, id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json(rows[0]);
});

app.delete('/api/ergtimes/:id', async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM ergtimes WHERE id = $1', [id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
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
