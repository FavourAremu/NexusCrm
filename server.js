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
const { Expo }   = require('expo-server-sdk');
const { Resend } = require('resend');

const app  = express();
const PORT = process.env.PORT || 3001;
const rateLimit = require('express-rate-limit');

// ─── Rate Limiting ────────────────────────────────────────────
// General API limiter — 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again in a minute.' },
  skip: (req) => req.path === '/api/health', // don't rate-limit health checks
});

// Strict limiter for auth routes — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes before trying again.' },
});

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api/', apiLimiter);          // rate limit all /api/ routes
app.use('/api/auth/', authLimiter);    // extra strict on auth routes

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

// ─── Admin Middleware ─────────────────────────────────────────
// Requires auth + admin role. First user to sign up is made admin automatically.
async function adminAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const r = await pool.query('SELECT role FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows[0] || r.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Check if account is active (not disabled) ───────────────
async function activeAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const r = await pool.query('SELECT active FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows[0] || r.rows[0].active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact your admin.' });
    }
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
      active     BOOLEAN DEFAULT TRUE,
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

    CREATE TABLE IF NOT EXISTS push_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user_name  TEXT,
      token      TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      user_name   TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      screen      TEXT,
      entity_type TEXT,
      entity_id   INTEGER,
      read        BOOLEAN DEFAULT FALSE,
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

// ─── Push Notifications ────────────────────────────────────────
const expo = new Expo();

/**
 * Send a push notification to one or more users by name.
 * excludeUser: skip sending to the user who triggered the action (so they don't get notified about their own changes)
 */
async function sendPushToUsers(userNames, title, body, data = {}, excludeUser = null) {
  try {
    const names = (Array.isArray(userNames) ? userNames : [userNames]).filter(n => n && n !== excludeUser);
    if (!names.length) return;

    const result = await pool.query(
      'SELECT token FROM push_tokens WHERE user_name = ANY($1)',
      [names]
    );
    const tokens = result.rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
    if (!tokens.length) return;

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error('Push notification error:', err.message);
  }
}

/** Send a push notification to everyone except the given user (broadcast to team) */
async function sendPushToTeam(title, body, data = {}, excludeUser = null) {
  try {
    const result = await pool.query('SELECT DISTINCT user_name FROM push_tokens');
    const names = result.rows.map(r => r.user_name);
    await sendPushToUsers(names, title, body, data, excludeUser);
  } catch (err) {
    console.error('Push notification error:', err.message);
  }
}

// ─── In-app + Push Notifications (unified) ─────────────────────
/**
 * Create in-app notification rows AND send push notifications to a set of users.
 * data: { screen, entity_type, entity_id } — used for both push payload and in-app filtering
 */
async function notifyUsers(userNames, title, body, data = {}, excludeUser = null) {
  const names = (Array.isArray(userNames) ? userNames : [userNames]).filter(n => n && n !== excludeUser);
  if (!names.length) return;

  // Write in-app notification rows
  try {
    for (const name of names) {
      await pool.query(
        'INSERT INTO notifications (user_name, title, body, screen, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [name, title, body, data.screen || null, data.entity_type || null, data.entity_id || null]
      );
    }
  } catch (err) {
    console.error('In-app notification error:', err.message);
  }

  // Send push notifications
  await sendPushToUsers(names, title, body, data, excludeUser);

  // Send email notifications
  const emailHtml = `
    <h2 style="margin:0 0 10px;color:#eaebee;font-size:18px">${title}</h2>
    <p style="margin:0 0 16px;color:#858c99;font-size:14px;line-height:1.6">${body || ''}</p>
    <a href="${process.env.APP_URL || 'https://nexuscrm-server-aolk.onrender.com'}" style="display:inline-block;background:#5c6bc0;color:#fff;text-decoration:none;padding:10px 20px;border-radius:7px;font-size:14px;font-weight:600">Open NexusCRM →</a>
  `;
  await sendEmailToUsers(names, `NexusCRM: ${title}`, emailHtml, excludeUser);
}

/** Notify everyone on the team except the given user */
async function notifyTeam(title, body, data = {}, excludeUser = null) {
  try {
    const result = await pool.query('SELECT DISTINCT name FROM users');
    const names = result.rows.map(r => r.name);
    await notifyUsers(names, title, body, data, excludeUser);
  } catch (err) {
    console.error('Notify team error:', err.message);
  }
}

// ─── Email Notifications (Resend) ─────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'NexusCRM <notifications@yourdomain.com>';

/**
 * Send an email notification to one or more users by name.
 * Looks up their email addresses from the users table.
 */
async function sendEmailToUsers(userNames, subject, htmlBody, excludeUser = null) {
  if (!process.env.RESEND_API_KEY) return; // skip if Resend not configured
  try {
    const names = (Array.isArray(userNames) ? userNames : [userNames]).filter(n => n && n !== excludeUser);
    if (!names.length) return;
    const result = await pool.query('SELECT email, name FROM users WHERE name = ANY($1)', [names]);
    for (const user of result.rows) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject,
        html: emailTemplate(user.name, htmlBody),
      });
    }
  } catch (err) {
    console.error('Email notification error:', err.message);
  }
}

async function sendEmailToTeam(subject, htmlBody, excludeUser = null) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const result = await pool.query('SELECT email, name FROM users');
    for (const user of result.rows) {
      if (user.name === excludeUser) continue;
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject,
        html: emailTemplate(user.name, htmlBody),
      });
    }
  } catch (err) {
    console.error('Email notification error:', err.message);
  }
}

function emailTemplate(recipientName, content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07080a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07080a;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d0f12;border:1px solid #1f2126;border-radius:12px;overflow:hidden;max-width:95vw">
        <tr><td style="background:#0d0f12;padding:20px 28px;border-bottom:1px solid #1f2126">
          <span style="font-size:20px;font-weight:800;color:#eaebee;letter-spacing:-0.5px">Nexus<span style="color:#7986cb">CRM</span></span>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 12px;color:#858c99;font-size:14px">Hi ${recipientName},</p>
          ${content}
          <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #1f2126;color:#454b57;font-size:12px">
            You're receiving this because you're a member of this NexusCRM workspace.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}



// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email, and password are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(password, 10);

    // First user to sign up automatically becomes admin
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    const isFirstUser = Number(countResult.rows[0].count) === 0;
    const role = isFirstUser ? 'admin' : 'member';

    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role',
      [name.trim(), email.toLowerCase().trim(), hashed, role]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await logActivity(user.name, isFirstUser ? 'created workspace as admin' : 'joined the workspace', '', 'system');
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
    if (user.active === false) return res.status(403).json({ error: 'Your account has been disabled. Contact your administrator.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await logActivity(user.name, 'signed in', '', 'system');
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
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

  const prev = await pool.query('SELECT stage FROM deals WHERE id=$1', [req.params.id]);
  const before = prev.rows[0] || {};

  const r = await pool.query(
    'UPDATE deals SET name=$1,company=$2,value=$3,stage=$4,probability=$5,contact=$6 WHERE id=$7 RETURNING *',
    [name, company, value, stage, probability, contact, req.params.id]
  );
  await logActivity(req.user.name, 'updated deal', name);

  // Celebrate when a deal is won 🎉
  if (stage === 'Closed Won' && before.stage !== 'Closed Won') {
    await notifyTeam(`🎉 Deal Won!`, `${req.user.name} closed "${name}" — $${Number(value||0).toLocaleString()}`, { screen: 'deals', entity_type: 'deal', entity_id: Number(req.params.id) }, req.user.name);
  }

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

  // Notify the assignee that a new ticket has been assigned to them
  if (assignee) {
    const typeLabel = (type || 'inquiry').charAt(0).toUpperCase() + (type || 'inquiry').slice(1);
    await notifyUsers(assignee, `New ${typeLabel}: ${title}`, `Assigned to you by ${req.user.name}`, { screen: 'tickets', entity_type: 'ticket', entity_id: r.rows[0].id }, req.user.name);
  }

  res.json(r.rows[0]);
});
app.put('/api/tickets/:id', auth, async (req, res) => {
  const { title, contact, type, priority, status, description, assignee } = req.body;

  // Get the previous state to detect changes worth notifying about
  const prev = await pool.query('SELECT status, assignee FROM tickets WHERE id=$1', [req.params.id]);
  const before = prev.rows[0] || {};

  const r = await pool.query(
    'UPDATE tickets SET title=$1,contact=$2,type=$3,priority=$4,status=$5,description=$6,assignee=$7 WHERE id=$8 RETURNING *',
    [title, contact, type, priority, status, description, assignee, req.params.id]
  );
  const action = status === 'resolved' && before.status !== 'resolved' ? 'resolved ticket' : 'updated ticket';
  await logActivity(req.user.name, action, title);

  // Notify on resolution
  if (status === 'resolved' && before.status !== 'resolved') {
    await notifyTeam(`Ticket Resolved`, `${req.user.name} resolved: ${title}`, { screen: 'tickets', entity_type: 'ticket', entity_id: Number(req.params.id) }, req.user.name);
  }
  // Notify newly assigned person
  if (assignee && assignee !== before.assignee) {
    await notifyUsers(assignee, `Ticket Assigned to You`, title, { screen: 'tickets', entity_type: 'ticket', entity_id: Number(req.params.id) }, req.user.name);
  }

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

  // Notify other people who've commented on this item (thread participants)
  const participants = await pool.query(
    'SELECT DISTINCT user_name FROM comments WHERE entity_type=$1 AND entity_id=$2 AND user_name != $3',
    [req.params.type, req.params.id, req.user.name]
  );
  const names = participants.rows.map(p => p.user_name);
  if (names.length) {
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    await notifyUsers(names, `New comment from ${req.user.name}`, preview, { screen: req.params.type === 'tickets' ? 'tickets' : 'dash', entity_type: req.params.type, entity_id: Number(req.params.id) }, req.user.name);
  }

  res.json(r.rows[0]);
});

// ════════════════════════════════════════════════════════════════
// IN-APP NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

// GET /api/notifications — fetch notifications for current user
app.get('/api/notifications', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM notifications WHERE user_name=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.name]
  );
  res.json(r.rows);
});

// GET /api/notifications/unread-count
app.get('/api/notifications/unread-count', auth, async (req, res) => {
  const r = await pool.query(
    'SELECT COUNT(*) FROM notifications WHERE user_name=$1 AND read=FALSE',
    [req.user.name]
  );
  res.json({ count: Number(r.rows[0].count) });
});

// PUT /api/notifications/:id/read — mark one notification as read
app.put('/api/notifications/:id/read', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET read=TRUE WHERE id=$1 AND user_name=$2', [req.params.id, req.user.name]);
  res.json({ ok: true });
});

// PUT /api/notifications/read-all — mark all as read
app.put('/api/notifications/read-all', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET read=TRUE WHERE user_name=$1', [req.user.name]);
  res.json({ ok: true });
});

// DELETE /api/notifications — clear all notifications for user
app.delete('/api/notifications', auth, async (req, res) => {
  await pool.query('DELETE FROM notifications WHERE user_name=$1', [req.user.name]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// TEAM / USERS
// ════════════════════════════════════════════════════════════════
app.get('/api/team', auth, async (req, res) => {
  const r = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC');
  res.json(r.rows);
});

// ════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

// POST /api/push-token — register/update this device's push token
app.post('/api/push-token', auth, async (req, res) => {
  const { token } = req.body;
  if (!token || !Expo.isExpoPushToken(token))
    return res.status(400).json({ error: 'Invalid push token' });
  try {
    await pool.query(
      `INSERT INTO push_tokens (user_id, user_name, token) VALUES ($1,$2,$3)
       ON CONFLICT (token) DO UPDATE SET user_id=$1, user_name=$2`,
      [req.user.id, req.user.name, token]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// DELETE /api/push-token — remove this device's push token (on sign out)
app.delete('/api/push-token', auth, async (req, res) => {
  const { token } = req.body || {};
  if (token) {
    await pool.query('DELETE FROM push_tokens WHERE token=$1', [token]);
  } else {
    // If no specific token provided, remove all tokens for this user (sign out everywhere)
    await pool.query('DELETE FROM push_tokens WHERE user_id=$1', [req.user.id]);
  }
  res.json({ ok: true });
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
