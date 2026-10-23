import express from 'express';
import cookieSession from 'cookie-session';
import { OAuth2Client } from 'google-auth-library';
import Database from 'better-sqlite3';
import { services } from './services.js';

const { GOOGLE_CLIENT_ID = '', SESSION_SECRET, PORT = 3000, NODE_ENV } = process.env;
if (!SESSION_SECRET) {
  console.error('Set SESSION_SECRET in .env (see .env.example).');
  process.exit(1);
}

const googleClientId = String(GOOGLE_CLIENT_ID || '').trim();
const isConfiguredGoogleClient = value =>
  /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value) &&
  !/^(dummy|example|replace-with|replace)/i.test(value);
const google = isConfiguredGoogleClient(googleClientId) ? new OAuth2Client(googleClientId) : null;

const db = new Database('senturia.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  sub TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, picture TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login TEXT);
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_sub TEXT, name TEXT NOT NULL, email TEXT NOT NULL,
  situation TEXT, need TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(cookieSession({
  name: 'sg', keys: [SESSION_SECRET], maxAge: 7 * 24 * 3600 * 1000,
  httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production'
}));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  });
  next();
});

// Small in-memory limiter for write routes (per IP, 20 requests/minute).
const hits = new Map();
const limit = (req, res, next) => {
  const k = req.ip, now = Date.now();
  const list = (hits.get(k) || []).filter(t => now - t < 60000);
  if (list.length >= 20) return res.status(429).json({ error: 'Too many requests' });
  list.push(now); hits.set(k, list); next();
};

const getUser = sub => sub && db.prepare('SELECT sub,email,name,picture FROM users WHERE sub=?').get(sub);

app.get('/api/config', (req, res) => res.json({
  googleClientId: googleClientId || null,
  googleLoginEnabled: Boolean(google)
}));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/services', (req, res) => res.json(services));

app.get('/api/services/:slug', (req, res) => {
  const service = services.find(item => item.slug === req.params.slug);
  if (!service) return res.status(404).json({ error: 'Service not found' });
  res.json(service);
});

app.get('/api/me', (req, res) => res.json({ user: getUser(req.session?.sub) || null }));

app.get('/services/:slug', (req, res, next) => {
  if (!services.some(item => item.slug === req.params.slug)) return next();
  res.sendFile('service.html', { root: 'public' });
});

app.post('/auth/google', limit, async (req, res) => {
  if (!google) return res.status(503).json({ error: 'Google Sign-In is not configured on this server.' });
  try {
    const ticket = await google.verifyIdToken({ idToken: String(req.body.credential || ''), audience: googleClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) return res.status(401).json({ error: 'Unverified Google account' });
    db.prepare(`INSERT INTO users(sub,email,name,picture,last_login) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture,last_login=CURRENT_TIMESTAMP`)
      .run(p.sub, p.email, p.name || p.email, p.picture || null);
    req.session = { sub: p.sub };
    res.json({ user: getUser(p.sub) });
  } catch {
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

app.post('/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

app.post('/api/requests', limit, (req, res) => {
  const b = req.body || {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  const r = { name: s(b.name, 120), email: s(b.email, 160), situation: s(b.situation, 60), need: s(b.need, 60), message: s(b.message, 2000) };
  if (!r.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  db.prepare('INSERT INTO requests(user_sub,name,email,situation,need,message) VALUES(?,?,?,?,?,?)')
    .run(req.session?.sub || null, r.name, r.email, r.situation, r.need, r.message);
  res.status(201).json({ ok: true });
});

app.use(express.static('public'));
app.listen(PORT, () => console.log(`Senturiaglobal running on http://localhost:${PORT}`));
