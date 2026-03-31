const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

// Database setup
const db = new Database(path.join(__dirname, 'bulk.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    weight REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS ergtimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    time_seconds REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Weight API ----

app.get('/api/weights', (req, res) => {
  const rows = db.prepare('SELECT * FROM weights ORDER BY date ASC').all();
  res.json(rows);
});

app.post('/api/weights', (req, res) => {
  const { date, weight } = req.body;
  if (!date || weight == null) {
    return res.status(400).json({ error: 'Date and weight are required' });
  }
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) {
    return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  }
  const stmt = db.prepare(`
    INSERT INTO weights (date, weight) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET weight = excluded.weight
  `);
  stmt.run(date, w);
  const row = db.prepare('SELECT * FROM weights WHERE date = ?').get(date);
  res.json(row);
});

app.put('/api/weights/:id', (req, res) => {
  const { weight } = req.body;
  const { id } = req.params;
  if (weight == null) {
    return res.status(400).json({ error: 'Weight is required' });
  }
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0 || w > 500) {
    return res.status(400).json({ error: 'Weight must be between 0 and 500 lbs' });
  }
  const result = db.prepare('UPDATE weights SET weight = ? WHERE id = ?').run(w, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  const row = db.prepare('SELECT * FROM weights WHERE id = ?').get(id);
  res.json(row);
});

app.delete('/api/weights/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM weights WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json({ success: true });
});

// ---- 2K Erg Time API ----

app.get('/api/ergtimes', (req, res) => {
  const rows = db.prepare('SELECT * FROM ergtimes ORDER BY date ASC').all();
  res.json(rows);
});

app.post('/api/ergtimes', (req, res) => {
  const { date, time_seconds } = req.body;
  if (!date || time_seconds == null) {
    return res.status(400).json({ error: 'Date and time are required' });
  }
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) {
    return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  }
  const stmt = db.prepare(`
    INSERT INTO ergtimes (date, time_seconds) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET time_seconds = excluded.time_seconds
  `);
  stmt.run(date, t);
  const row = db.prepare('SELECT * FROM ergtimes WHERE date = ?').get(date);
  res.json(row);
});

app.put('/api/ergtimes/:id', (req, res) => {
  const { time_seconds } = req.body;
  const { id } = req.params;
  if (time_seconds == null) {
    return res.status(400).json({ error: 'Time is required' });
  }
  const t = parseFloat(time_seconds);
  if (isNaN(t) || t <= 0 || t > 3600) {
    return res.status(400).json({ error: 'Time must be between 0 and 60 minutes' });
  }
  const result = db.prepare('UPDATE ergtimes SET time_seconds = ? WHERE id = ?').run(t, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  const row = db.prepare('SELECT * FROM ergtimes WHERE id = ?').get(id);
  res.json(row);
});

app.delete('/api/ergtimes/:id', (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM ergtimes WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Bulk is running at http://localhost:${PORT}`);
});
