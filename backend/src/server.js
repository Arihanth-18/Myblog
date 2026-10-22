import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { FileStore, PostgresStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, '../frontend/dist');
const PORT = Number(process.env.PORT) || 4000;

/* ---------- configuration ---------- */
const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('\nMissing ADMIN_EMAIL, ADMIN_PASSWORD or JWT_SECRET.\n' +
    'Run "npm run setup" in the project root (or copy backend/.env.example to backend/.env and fill it in).\n');
  process.exit(1);
}
const dbUrl = (process.env.DATABASE_URL || '').trim();
if (dbUrl && /USER:PASSWORD@/.test(dbUrl)) {
  console.error('\nDATABASE_URL in backend/.env is still the placeholder.\nPaste your real Neon connection string (Neon dashboard -> Connect), or clear the value to use local file storage.\n');
  process.exit(1);
}
if (!dbUrl) console.warn('\n[!] DATABASE_URL is empty: using local file storage (backend/data/db.json). Set it to your Neon connection string for a real database.\n');
const store = dbUrl
  ? new PostgresStore(dbUrl)
  : new FileStore(path.join(ROOT, 'data', 'db.json'));

const app = express();
app.set('trust proxy', 1);
const origins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '1mb' }));

/* ---------- helpers ---------- */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};
const str = (v, max) => String(v ?? '').trim().slice(0, max);

const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');

async function uniqueSlug(base, exceptId = null) {
  const root = slugify(base) || 'entry';
  let slug = root;
  for (let n = 2; await store.slugExists(slug, exceptId); n++) slug = `${root}-${n}`;
  return slug;
}

// Only allow safe link schemes (blocks javascript: etc.). Returns '' if invalid.
function cleanUrl(v, { allowRelative = false, allowMailto = false, allowData = false } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (allowRelative && /^\/(?!\/)/.test(s)) return s.slice(0, 500);
  if (allowData && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 400_000) return s;
  if (allowMailto && /^mailto:[^\s]+$/i.test(s)) return s.slice(0, 500);
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 2000) : '';
  } catch { return ''; }
}

function cleanTags(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [];
  for (const t of list) {
    const tag = String(t).trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 20);
}

function parseEntry(body = {}) {
  const title = str(body.title, 300);
  if (!title) return { error: 'A title is required.' };
  const rawUrl = String(body.url ?? '').trim();
  const url = cleanUrl(rawUrl);
  if (rawUrl && !url) return { error: 'The link must start with http:// or https://' };
  let created_at = null;
  if (body.created_at) {
    const d = new Date(body.created_at);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid date.' };
    created_at = d.toISOString();
  }
  return {
    value: {
      title, url,
      slugInput: str(body.slug, 200),
      description: str(body.description, 2000),
      content: String(body.content ?? '').slice(0, 100_000),
      tags: cleanTags(body.tags),
      published: body.published !== false,
      created_at,
    },
  };
}

const publicEntry = ({ content, ...e }) => ({ ...e, has_content: Boolean(content && content.trim()) });
const tagCounts = entries => {
  const map = new Map();
  for (const e of entries) for (const t of e.tags) map.set(t, (map.get(t) || 0) + 1);
  return [...map].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
};

/* ---------- auth ---------- */
function adminAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Please sign in as the admin.' }); }
}
const attempts = new Map(); // ip -> { n, reset }
function loginLimiter(req, res, next) {
  const now = Date.now();
  const rec = attempts.get(req.ip);
  if (rec && rec.reset > now && rec.n >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  if (!rec || rec.reset <= now) attempts.set(req.ip, { n: 0, reset: now + 15 * 60_000 });
  next();
}

app.get('/api/health', wrap(async (_req, res) => {
  try { await store.ping(); res.json({ status: 'ok', storage: store.kind }); }
  catch { res.status(503).json({ status: 'error', storage: store.kind }); }
}));

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const ok = safeEqual(String(email).toLowerCase(), ADMIN_EMAIL.toLowerCase()) & safeEqual(password, ADMIN_PASSWORD);
  if (!ok) { attempts.get(req.ip).n++; return res.status(401).json({ error: 'Invalid email or password.' }); }
  attempts.delete(req.ip);
  res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' }), email: ADMIN_EMAIL });
});
app.get('/api/auth/me', adminAuth, (_req, res) => res.json({ ok: true, email: ADMIN_EMAIL }));

/* ---------- settings ---------- */
app.get('/api/settings', wrap(async (_req, res) => res.json(await store.getSettings())));

app.put('/api/admin/settings', adminAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const nav = (Array.isArray(b.nav_links) ? b.nav_links : []).slice(0, 12).map(l => ({
    label: str(l?.label, 40),
    url: cleanUrl(l?.url, { allowRelative: true, allowMailto: true }),
  })).filter(l => l.label && l.url);

  const avatarRaw = String(b.avatar_url ?? '').trim();
  const avatar_url = cleanUrl(avatarRaw, { allowRelative: true, allowData: true });
  if (avatarRaw && !avatar_url) return res.status(400).json({ error: 'Profile picture must be an image upload or an http(s) URL.' });

  const saved = await store.saveSettings({
    site_name: str(b.site_name, 120) || 'Your Name',
    tagline: str(b.tagline, 300),
    avatar_url,
    page_title: str(b.page_title, 120) || 'Musings',
    page_description: str(b.page_description, 1000),
    show_tags_link: Boolean(b.show_tags_link),
    home_text: String(b.home_text ?? '').slice(0, 5000),
    nav_links: nav,
  });
  res.json(saved);
}));

/* ---------- public entries ---------- */
app.get('/api/entries', wrap(async (req, res) => {
  const tag = req.query.tag ? String(req.query.tag).toLowerCase() : null;
  const limit = Math.min(Number(req.query.limit) || 0, 500);
  let rows = await store.listEntries({ publishedOnly: true, tag });
  if (limit) rows = rows.slice(0, limit);
  res.json(rows.map(publicEntry));
}));
app.get('/api/tags', wrap(async (_req, res) => res.json(tagCounts(await store.listEntries({ publishedOnly: true })))));
app.get('/api/entries/:slug', wrap(async (req, res) => {
  const e = await store.getEntryBySlug(req.params.slug);
  if (!e || !e.published) return res.status(404).json({ error: 'Entry not found.' });
  res.json(e);
}));

/* ---------- admin entries ---------- */
app.get('/api/admin/entries', adminAuth, wrap(async (_req, res) => res.json(await store.listEntries())));

app.post('/api/admin/entries', adminAuth, wrap(async (req, res) => {
  const { value, error } = parseEntry(req.body);
  if (error) return res.status(400).json({ error });
  const { slugInput, ...data } = value;
  if (slugInput && await store.slugExists(slugify(slugInput))) return res.status(409).json({ error: 'That URL slug is already in use.' });
  data.slug = await uniqueSlug(slugInput || data.title);
  res.status(201).json(await store.createEntry(data));
}));

app.put('/api/admin/entries/:id', adminAuth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { value, error } = parseEntry(req.body);
  if (error) return res.status(400).json({ error });
  const { slugInput, ...data } = value;
  if (slugInput && await store.slugExists(slugify(slugInput), id)) return res.status(409).json({ error: 'That URL slug is already in use.' });
  data.slug = await uniqueSlug(slugInput || data.title, id);
  const row = await store.updateEntry(id, data);
  if (!row) return res.status(404).json({ error: 'Entry not found.' });
  res.json(row);
}));

app.delete('/api/admin/entries/:id', adminAuth, wrap(async (req, res) => {
  if (!(await store.deleteEntry(Number(req.params.id)))) return res.status(404).json({ error: 'Entry not found.' });
  res.status(204).end();
}));

/* ---------- admin tags ---------- */
app.get('/api/admin/tags', adminAuth, wrap(async (_req, res) => res.json(tagCounts(await store.listEntries()))));
app.put('/api/admin/tags/rename', adminAuth, wrap(async (req, res) => {
  const [from] = cleanTags([req.body?.from]);
  const [to] = cleanTags([req.body?.to]);
  if (!from || !to) return res.status(400).json({ error: 'Both the old and new tag names are required.' });
  await store.renameTag(from, to);
  res.json({ ok: true });
}));
app.delete('/api/admin/tags/:tag', adminAuth, wrap(async (req, res) => {
  const [tag] = cleanTags([req.params.tag]);
  if (tag) await store.deleteTag(tag);
  res.status(204).end();
}));

/* ---------- RSS ---------- */
const xml = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
app.get(['/rss.xml', '/api/rss.xml'], wrap(async (req, res) => {
  const base = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const [settings, entries] = await Promise.all([store.getSettings(), store.listEntries({ publishedOnly: true })]);
  const items = entries.slice(0, 50).map(e => {
    const page = `${base}/musings/${e.slug}`;
    return `<item><title>${xml(e.title)}</title><link>${xml(e.url || page)}</link><guid isPermaLink="false">${xml(page)}</guid>` +
      `<pubDate>${new Date(e.created_at).toUTCString()}</pubDate><description>${xml(e.description)}</description>` +
      e.tags.map(t => `<category>${xml(t)}</category>`).join('') + '</item>';
  }).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>` +
    `<title>${xml(`${settings.site_name} – ${settings.page_title}`)}</title><link>${xml(base)}</link>` +
    `<description>${xml(settings.tagline)}</description>${items}</channel></rss>`);
}));

/* ---------- frontend (production build) ---------- */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text/plain').send(
    'Musings API is running.\nFrontend not built yet: run "npm run build" (or "npm run dev" for development on http://localhost:5173).'));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

try {
  await store.init();
} catch (err) {
  console.error(`Storage initialisation failed (${store.kind}):`, err.message);
  if (store.kind === 'postgres') console.error('Check that DATABASE_URL is the full Neon connection string (including ?sslmode=require) and that the Neon project is active.');
  process.exit(1);
}
app.listen(PORT, () => console.log(`Musings running on http://localhost:${PORT}  (storage: ${store.kind})`));
