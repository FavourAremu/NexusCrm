/**
 * NexusCRM — Backend API
 * Stack: Node.js + Express + Neon (Postgres) + JWT
 *
 * Setup:
 *   npm install express pg bcryptjs jsonwebtoken cors dotenv
 *   node server.js
 */

require('dotenv').config();
const express    = require('express');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── Serve Frontend ───────────────────────────────────────────
const pathMod = require('path');
app.use(express.static(pathMod.join(__dirname, 'public')));

// ─── Neon Postgres Connection ─────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // your Neon connection string
  ssl: { rejectUnauthorized: false }           // required for Neon
});

// ─── JWT Secret ───────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

// ─── Auth Middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── DB Init — Create all tables ─────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      role       TEXT DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      company    TEXT,
      email      TEXT,
      phone      TEXT,
      status     TEXT DEFAULT 'lead',
      added_by   TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      company      TEXT,
      email        TEXT,
      phone        TEXT,
      source       TEXT,
      value        NUMERIC DEFAULT 0,
      notes        TEXT,
      score        INTEGER DEFAULT 0,
      captured_by  TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS deals (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      company     TEXT,
      value       NUMERIC DEFAULT 0,
      stage       TEXT DEFAULT 'Lead',
      probability INTEGER DEFAULT 0,
      contact     TEXT,
      owner       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      contact     TEXT,
      type        TEXT DEFAULT 'inquiry',
      priority    TEXT DEFAULT 'medium',
      status      TEXT DEFAULT 'open',
      description TEXT,
      assignee    TEXT,
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      category   TEXT,
      contact    TEXT,
      phone      TEXT,
      status     TEXT DEFAULT 'active',
      contract   TEXT,
      notes      TEXT,
      added_by   TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      contact     TEXT,
      due         TEXT,
      priority    TEXT DEFAULT 'medium',
      done        BOOLEAN DEFAULT FALSE,
      assigned_to TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         SERIAL PRIMARY KEY,
      content    TEXT NOT NULL,
      contact    TEXT,
      date       TEXT,
      tag        TEXT DEFAULT 'note',
      added_by   TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversions (
      id            SERIAL PRIMARY KEY,
      lead_name     TEXT,
      company       TEXT,
      converted_by  TEXT,
      deal_name     TEXT,
      deal_value    NUMERIC DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity (
      id         SERIAL PRIMARY KEY,
      user_name  TEXT,
      action     TEXT,
      target     TEXT,
      type       TEXT DEFAULT 'action',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS comments (
      id          SERIAL PRIMARY KEY,
      entity_type TEXT,
      entity_id   INTEGER,
      user_name   TEXT,
      text        TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Database tables ready');
}

// ─── Helper: log activity ─────────────────────────────────────
async function logActivity(userName, action, target, type = 'action') {
  await pool.query(
    'INSERT INTO activity (user_name, action, target, type) VALUES ($1,$2,$3,$4)',
    [userName, action, target, type]
  );
}

// ════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════════

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1,$2,$3) RETURNING id, name, email, role',
      [name.trim(), email.toLowerCase().trim(), hashed]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await logActivity(user.name, 'joined the workspace', '', 'system');
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error during sign up' });
  }
});

// POST /api/auth/signin
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'No account found with that email' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await logActivity(user.name, 'signed in', '', 'system');
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during sign in' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id=$1', [req.user.id]);
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════════════
// CONTACTS
// ════════════════════════════════════════════════════════════════
app.get('/api/contacts', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/contacts', auth, async (req, res) => {
  const { name, company, email, phone, status } = req.body;
  const r = await pool.query(
    'INSERT INTO contacts (name,company,email,phone,status,added_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [name, company, email, phone, status || 'lead', req.user.name]
  );
  await logActivity(req.user.name, 'added contact', name);
  res.json(r.rows[0]);
});
app.put('/api/contacts/:id', auth, async (req, res) => {
  const { name, company, email, phone, status } = req.body;
  const r = await pool.query(
    'UPDATE contacts SET name=$1,company=$2,email=$3,phone=$4,status=$5 WHERE id=$6 RETURNING *',
    [name, company, email, phone, status, req.params.id]
  );
  await logActivity(req.user.name, 'updated contact', name);
  res.json(r.rows[0]);
});
app.delete('/api/contacts/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM contacts WHERE id=$1 RETURNING name', [req.params.id]);
  await logActivity(req.user.name, 'deleted contact', r.rows[0]?.name || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// LEADS
// ════════════════════════════════════════════════════════════════
app.get('/api/leads', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/leads', auth, async (req, res) => {
  const { name, company, email, phone, source, value, notes, score } = req.body;
  const r = await pool.query(
    'INSERT INTO leads (name,company,email,phone,source,value,notes,score,captured_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [name, company, email, phone, source, value || 0, notes, score || 0, req.user.name]
  );
  await logActivity(req.user.name, 'captured lead', name);
  res.json(r.rows[0]);
});
app.delete('/api/leads/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM leads WHERE id=$1 RETURNING name', [req.params.id]);
  await logActivity(req.user.name, 'deleted lead', r.rows[0]?.name || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// DEALS
// ════════════════════════════════════════════════════════════════
app.get('/api/deals', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM deals ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/deals', auth, async (req, res) => {
  const { name, company, value, stage, probability, contact } = req.body;
  const r = await pool.query(
    'INSERT INTO deals (name,company,value,stage,probability,contact,owner) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, company, value || 0, stage || 'Lead', probability || 0, contact, req.user.name]
  );
  await logActivity(req.user.name, 'added deal', name);
  res.json(r.rows[0]);
});
app.put('/api/deals/:id', auth, async (req, res) => {
  const { name, company, value, stage, probability, contact } = req.body;
  const r = await pool.query(
    'UPDATE deals SET name=$1,company=$2,value=$3,stage=$4,probability=$5,contact=$6 WHERE id=$7 RETURNING *',
    [name, company, value, stage, probability, contact, req.params.id]
  );
  await logActivity(req.user.name, 'updated deal', name);
  res.json(r.rows[0]);
});
app.delete('/api/deals/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM deals WHERE id=$1 RETURNING name', [req.params.id]);
  await logActivity(req.user.name, 'deleted deal', r.rows[0]?.name || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// TICKETS
// ════════════════════════════════════════════════════════════════
app.get('/api/tickets', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/tickets', auth, async (req, res) => {
  const { title, contact, type, priority, description, assignee } = req.body;
  const r = await pool.query(
    'INSERT INTO tickets (title,contact,type,priority,description,assignee,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [title, contact, type || 'inquiry', priority || 'medium', description, assignee, req.user.name]
  );
  await logActivity(req.user.name, 'opened ticket', title);
  res.json(r.rows[0]);
});
app.put('/api/tickets/:id', auth, async (req, res) => {
  const { title, contact, type, priority, status, description, assignee } = req.body;
  const r = await pool.query(
    'UPDATE tickets SET title=$1,contact=$2,type=$3,priority=$4,status=$5,description=$6,assignee=$7 WHERE id=$8 RETURNING *',
    [title, contact, type, priority, status, description, assignee, req.params.id]
  );
  await logActivity(req.user.name, 'updated ticket', title);
  res.json(r.rows[0]);
});
app.delete('/api/tickets/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM tickets WHERE id=$1 RETURNING title', [req.params.id]);
  await logActivity(req.user.name, 'deleted ticket', r.rows[0]?.title || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// VENDORS
// ════════════════════════════════════════════════════════════════
app.get('/api/vendors', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM vendors ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/vendors', auth, async (req, res) => {
  const { name, category, contact, phone, status, contract, notes } = req.body;
  const r = await pool.query(
    'INSERT INTO vendors (name,category,contact,phone,status,contract,notes,added_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [name, category, contact, phone, status || 'active', contract, notes, req.user.name]
  );
  await logActivity(req.user.name, 'added vendor', name);
  res.json(r.rows[0]);
});
app.put('/api/vendors/:id', auth, async (req, res) => {
  const { name, category, contact, phone, status, contract, notes } = req.body;
  const r = await pool.query(
    'UPDATE vendors SET name=$1,category=$2,contact=$3,phone=$4,status=$5,contract=$6,notes=$7 WHERE id=$8 RETURNING *',
    [name, category, contact, phone, status, contract, notes, req.params.id]
  );
  await logActivity(req.user.name, 'updated vendor', name);
  res.json(r.rows[0]);
});
app.delete('/api/vendors/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM vendors WHERE id=$1 RETURNING name', [req.params.id]);
  await logActivity(req.user.name, 'deleted vendor', r.rows[0]?.name || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// TASKS
// ════════════════════════════════════════════════════════════════
app.get('/api/tasks', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/tasks', auth, async (req, res) => {
  const { title, contact, due, priority } = req.body;
  const r = await pool.query(
    'INSERT INTO tasks (title,contact,due,priority,assigned_to) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [title, contact, due, priority || 'medium', req.user.name]
  );
  await logActivity(req.user.name, 'added task', title);
  res.json(r.rows[0]);
});
app.put('/api/tasks/:id', auth, async (req, res) => {
  const { title, contact, due, priority, done } = req.body;
  const r = await pool.query(
    'UPDATE tasks SET title=$1,contact=$2,due=$3,priority=$4,done=$5 WHERE id=$6 RETURNING *',
    [title, contact, due, priority, done, req.params.id]
  );
  await logActivity(req.user.name, done ? 'completed task' : 'updated task', title);
  res.json(r.rows[0]);
});
app.delete('/api/tasks/:id', auth, async (req, res) => {
  const r = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING title', [req.params.id]);
  await logActivity(req.user.name, 'deleted task', r.rows[0]?.title || '');
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// NOTES
// ════════════════════════════════════════════════════════════════
app.get('/api/notes', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM notes ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/notes', auth, async (req, res) => {
  const { content, contact, date, tag } = req.body;
  const r = await pool.query(
    'INSERT INTO notes (content,contact,date,tag,added_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [content, contact, date, tag || 'note', req.user.name]
  );
  await logActivity(req.user.name, 'added note for', contact);
  res.json(r.rows[0]);
});
app.put('/api/notes/:id', auth, async (req, res) => {
  const { content, contact, date, tag } = req.body;
  const r = await pool.query(
    'UPDATE notes SET content=$1,contact=$2,date=$3,tag=$4 WHERE id=$5 RETURNING *',
    [content, contact, date, tag, req.params.id]
  );
  res.json(r.rows[0]);
});
app.delete('/api/notes/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// CONVERSIONS
// ════════════════════════════════════════════════════════════════
app.get('/api/conversions', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM conversions ORDER BY created_at DESC');
  res.json(r.rows);
});
app.post('/api/conversions', auth, async (req, res) => {
  const { leadName, company, dealName, dealValue, leadId } = req.body;
  // Create contact
  await pool.query(
    'INSERT INTO contacts (name,company,status,added_by) VALUES ($1,$2,$3,$4)',
    [leadName, company, 'client', req.user.name]
  );
  // Create deal
  await pool.query(
    'INSERT INTO deals (name,company,value,stage,probability,contact,owner) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [dealName, company, dealValue || 0, 'Qualified', 40, leadName, req.user.name]
  );
  // Remove lead
  if (leadId) await pool.query('DELETE FROM leads WHERE id=$1', [leadId]);
  // Log conversion
  const r = await pool.query(
    'INSERT INTO conversions (lead_name,company,converted_by,deal_name,deal_value) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [leadName, company, req.user.name, dealName, dealValue || 0]
  );
  await logActivity(req.user.name, 'converted lead to client', leadName);
  res.json(r.rows[0]);
});

// ════════════════════════════════════════════════════════════════
// ACTIVITY + COMMENTS
// ════════════════════════════════════════════════════════════════
app.get('/api/activity', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 80');
  res.json(r.rows);
});

app.get('/api/comments/:type/:id', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM comments WHERE entity_type=$1 AND entity_id=$2 ORDER BY created_at ASC',
    [req.params.type, req.params.id]
  );
  res.json(r.rows);
});
app.post('/api/comments/:type/:id', auth, async (req, res) => {
  const { text } = req.body;
  const r = await pool.query(
    'INSERT INTO comments (entity_type,entity_id,user_name,text) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.type, req.params.id, req.user.name, text]
  );
  await logActivity(req.user.name, 'commented on', req.params.type);
  res.json(r.rows[0]);
});

// ════════════════════════════════════════════════════════════════
// TEAM / USERS
// ════════════════════════════════════════════════════════════════
app.get('/api/team', auth, async (req, res) => {
  const r = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC');
  res.json(r.rows);
});

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Catch-all: serve frontend for any non-API route ──────────
app.get('*', (req, res) => {
  res.sendFile(pathMod.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 NexusCRM API running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('❌ Failed to init database:', err.message);
  process.exit(1);
});
