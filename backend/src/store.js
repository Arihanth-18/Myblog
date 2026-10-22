// Storage layer. Two interchangeable drivers with the same async interface:
//   - FileStore:     JSON file on disk (default, zero configuration)
//   - PostgresStore: PostgreSQL / Neon (used when DATABASE_URL is set)
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export const DEFAULT_SETTINGS = {
  site_name: 'Your Name',
  tagline: 'Musings on life, work, and everything in between',
  avatar_url: '',
  page_title: 'Musings',
  page_description: 'An assorted collection of thoughts.',
  show_tags_link: true,
  home_text: '',
  nav_links: [
    { label: 'Home', url: '/' },
    { label: 'Musings', url: '/musings' },
  ],
};

const sortNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id;

/* ------------------------------------------------------------------ */
/* File store                                                         */
/* ------------------------------------------------------------------ */
export class FileStore {
  constructor(file, seedSettings = {}) {
    this.file = file;
    this.seed = { ...DEFAULT_SETTINGS, ...seedSettings };
    this.queue = Promise.resolve();
    this.kind = 'file';
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.data.settings = { ...this.seed, ...this.data.settings };
      this.data.entries ||= [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error(`Could not read ${this.file}: ${err.message}`);
      this.data = { settings: this.seed, entries: [], next_id: 1 };
      await this.#save();
    }
    this.data.next_id ||= this.data.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  #save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.catch(() => {}).then(async () => {
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, snapshot);
      await fs.rename(tmp, this.file);
    });
    return this.queue;
  }

  async ping() { return true; }
  async getSettings() { return { ...this.data.settings }; }
  async saveSettings(s) { this.data.settings = { ...this.data.settings, ...s }; await this.#save(); return this.getSettings(); }

  async listEntries({ publishedOnly = false, tag = null } = {}) {
    return this.data.entries
      .filter(e => (!publishedOnly || e.published) && (!tag || e.tags.includes(tag)))
      .sort(sortNewest)
      .map(e => ({ ...e, tags: [...e.tags] }));
  }
  async getEntryBySlug(slug) { const e = this.data.entries.find(x => x.slug === slug); return e ? { ...e } : null; }
  async slugExists(slug, exceptId = null) { return this.data.entries.some(e => e.slug === slug && e.id !== exceptId); }

  async createEntry(entry) {
    const now = new Date().toISOString();
    const row = { ...entry, id: this.data.next_id++, created_at: entry.created_at || now, updated_at: now };
    this.data.entries.push(row);
    await this.#save();
    return { ...row };
  }
  async updateEntry(id, entry) {
    const i = this.data.entries.findIndex(e => e.id === id);
    if (i < 0) return null;
    const prev = this.data.entries[i];
    this.data.entries[i] = { ...prev, ...entry, id, created_at: entry.created_at || prev.created_at, updated_at: new Date().toISOString() };
    await this.#save();
    return { ...this.data.entries[i] };
  }
  async deleteEntry(id) {
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.id !== id);
    if (this.data.entries.length === before) return false;
    await this.#save();
    return true;
  }
  async renameTag(from, to) {
    for (const e of this.data.entries) {
      if (e.tags.includes(from)) e.tags = [...new Set(e.tags.map(t => (t === from ? to : t)))];
    }
    await this.#save();
  }
  async deleteTag(tag) {
    for (const e of this.data.entries) e.tags = e.tags.filter(t => t !== tag);
    await this.#save();
  }
}

/* ------------------------------------------------------------------ */
/* PostgreSQL store                                                   */
/* ------------------------------------------------------------------ */
const COLS = 'id::int AS id, title, slug, url, description, content, tags, published, created_at, updated_at';

export class PostgresStore {
  constructor(connectionString, seedSettings = {}) {
    this.seed = { ...DEFAULT_SETTINGS, ...seedSettings };
    this.kind = 'postgres';
    const needsSsl = !/sslmode=/.test(connectionString) && !/@(localhost|127\.0\.0\.1)/.test(connectionString);
    this.pool = new pg.Pool({ connectionString, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
  }

  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      tags TEXT[] NOT NULL DEFAULT '{}',
      published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS site_config (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL
    )`);
    await this.pool.query('INSERT INTO site_config (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [JSON.stringify(this.seed)]);
  }

  async ping() { await this.pool.query('SELECT 1'); return true; }

  async getSettings() {
    const { rows } = await this.pool.query('SELECT data FROM site_config WHERE id = 1');
    return { ...this.seed, ...(rows[0]?.data || {}) };
  }
  async saveSettings(s) {
    const merged = { ...(await this.getSettings()), ...s };
    await this.pool.query('UPDATE site_config SET data = $1 WHERE id = 1', [JSON.stringify(merged)]);
    return merged;
  }

  async listEntries({ publishedOnly = false, tag = null } = {}) {
    const where = [];
    const params = [];
    if (publishedOnly) where.push('published = TRUE');
    if (tag) { params.push(tag); where.push(`$${params.length} = ANY(tags)`); }
    const { rows } = await this.pool.query(
      `SELECT ${COLS} FROM entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`, params);
    return rows;
  }
  async getEntryBySlug(slug) {
    const { rows } = await this.pool.query(`SELECT ${COLS} FROM entries WHERE slug = $1`, [slug]);
    return rows[0] || null;
  }
  async slugExists(slug, exceptId = null) {
    const { rows } = await this.pool.query('SELECT 1 FROM entries WHERE slug = $1 AND ($2::int IS NULL OR id <> $2::int)', [slug, exceptId]);
    return rows.length > 0;
  }
  async createEntry(e) {
    const { rows } = await this.pool.query(
      `INSERT INTO entries (title, slug, url, description, content, tags, published, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, NOW())) RETURNING ${COLS}`,
      [e.title, e.slug, e.url, e.description, e.content, e.tags, e.published, e.created_at || null]);
    return rows[0];
  }
  async updateEntry(id, e) {
    const { rows } = await this.pool.query(
      `UPDATE entries SET title=$1, slug=$2, url=$3, description=$4, content=$5, tags=$6, published=$7,
         created_at=COALESCE($8, created_at), updated_at=NOW() WHERE id=$9 RETURNING ${COLS}`,
      [e.title, e.slug, e.url, e.description, e.content, e.tags, e.published, e.created_at || null, id]);
    return rows[0] || null;
  }
  async deleteEntry(id) {
    const r = await this.pool.query('DELETE FROM entries WHERE id = $1', [id]);
    return r.rowCount > 0;
  }
  async renameTag(from, to) {
    const { rows } = await this.pool.query('SELECT id, tags FROM entries WHERE $1 = ANY(tags)', [from]);
    for (const r of rows) {
      const tags = [...new Set(r.tags.map(t => (t === from ? to : t)))];
      await this.pool.query('UPDATE entries SET tags = $1 WHERE id = $2', [tags, r.id]);
    }
  }
  async deleteTag(tag) {
    await this.pool.query('UPDATE entries SET tags = array_remove(tags, $1) WHERE $1 = ANY(tags)', [tag]);
  }
}
