import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errMsg, getToken, setToken } from '../api.js';
import { Avatar } from '../components/Layout.jsx';
import { useSettings } from '../settings.jsx';

/* ---------------- Login ---------------- */
export function Login() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = `Admin · ${settings.site_name}`; }, [settings.site_name]);
  useEffect(() => { if (getToken()) api.get('/auth/me').then(() => nav('/admin/dashboard', { replace: true })).catch(() => setToken(null)); }, [nav]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api.post('/auth/login', { email, password });
      setToken(r.data.token);
      nav('/admin/dashboard');
    } catch (err) {
      setError(err.response ? errMsg(err, 'Login failed.') : 'Cannot reach the server. Is the backend running?');
    } finally { setBusy(false); }
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Admin sign in</h1>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link className="muted-link" to="/">← Back to site</Link>
      </form>
    </main>
  );
}

/* ---------------- helpers ---------------- */
const toDateInput = iso => {
  const d = iso ? new Date(iso) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const blankEntry = () => ({ title: '', url: '', description: '', content: '', tags: [], published: true, slug: '', date: toDateInput() });

function TagInput({ value, onChange, suggestions }) {
  const [text, setText] = useState('');
  const add = raw => {
    const t = raw.trim().toLowerCase().replace(/^#/, '');
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  return (
    <div className="tag-input">
      {value.map(t => <span className="chip" key={t}>#{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter(x => x !== t))}>×</button></span>)}
      <input
        value={text} list="tag-suggestions" placeholder={value.length ? '' : 'Type a tag, press Enter'}
        onChange={e => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); add(text); }
          else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
      />
      <datalist id="tag-suggestions">{suggestions.filter(s => !value.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

// Crops to a square and shrinks to 256px so the picture stays small in the database.
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256, s = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

/* ---------------- Entries tab ---------------- */
function EntriesTab({ flash }) {
  const [entries, setEntries] = useState([]);
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState(blankEntry());
  const [editing, setEditing] = useState(null);
  const formRef = useRef(null);
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const load = async () => {
    const [e, t] = await Promise.all([api.get('/admin/entries'), api.get('/admin/tags')]);
    setEntries(e.data); setTags(t.data.map(x => x.tag));
  };
  useEffect(() => { load().catch(err => flash(errMsg(err, 'Could not load entries.'), true)); }, []); // eslint-disable-line

  function edit(e) {
    setEditing(e.id);
    setForm({ ...blankEntry(), ...e, date: toDateInput(e.created_at) });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const reset = () => { setEditing(null); setForm(blankEntry()); };

  async function save(ev) {
    ev.preventDefault();
    const payload = { ...form, created_at: form.date ? new Date(`${form.date}T12:00:00`).toISOString() : undefined };
    try {
      if (editing) await api.put(`/admin/entries/${editing}`, payload); else await api.post('/admin/entries', payload);
      reset(); flash(editing ? 'Entry updated.' : 'Entry added.'); await load();
    } catch (err) { flash(errMsg(err, 'Could not save the entry.'), true); }
  }
  async function remove(e) {
    if (!window.confirm(`Delete "${e.title}" permanently?`)) return;
    try { await api.delete(`/admin/entries/${e.id}`); if (editing === e.id) reset(); flash('Entry deleted.'); await load(); }
    catch (err) { flash(errMsg(err, 'Could not delete the entry.'), true); }
  }
  async function toggle(e) {
    try { await api.put(`/admin/entries/${e.id}`, { ...e, published: !e.published }); await load(); }
    catch (err) { flash(errMsg(err, 'Could not update the entry.'), true); }
  }

  return (
    <div className="admin-grid">
      <section className="card" ref={formRef}>
        <div className="card-head"><h2>{editing ? 'Edit entry' : 'New entry'}</h2>{editing && <button className="link-btn" onClick={reset}>Cancel</button>}</div>
        <form onSubmit={save}>
          <label>Title *<input value={form.title} onChange={e => set({ title: e.target.value })} required placeholder="History may not repeat itself, but it often rhymes" /></label>
          <label>Link (optional)<input type="url" value={form.url} onChange={e => set({ url: e.target.value })} placeholder="https://x.com/..." />
            <small>If set, the title links to this address and its domain is shown under the title.</small></label>
          <label>Description<textarea rows="3" value={form.description} onChange={e => set({ description: e.target.value })} placeholder="A line or two shown under the title" /></label>
          <label>Tags<TagInput value={form.tags} onChange={tags => set({ tags })} suggestions={tags} /></label>
          <label>Date<input type="date" value={form.date} onChange={e => set({ date: e.target.value })} /></label>
          <label>Full text (optional)<textarea className="tall" rows="8" value={form.content} onChange={e => set({ content: e.target.value })} placeholder="Write a longer note. If filled in, the entry gets its own page." /></label>
          <label>URL slug (optional)<input value={form.slug} onChange={e => set({ slug: e.target.value })} placeholder="auto-generated from the title" /></label>
          <label className="check"><input type="checkbox" checked={form.published} onChange={e => set({ published: e.target.checked })} /> Published (uncheck to keep as a draft)</label>
          <button className="btn primary">{editing ? 'Save changes' : 'Add entry'}</button>
        </form>
      </section>

      <section className="card">
        <div className="card-head"><h2>All entries</h2><span className="pill">{entries.length}</span></div>
        {entries.length === 0 && <p className="muted">No entries yet. Add your first one on the left.</p>}
        {entries.map(e => (
          <div className="row" key={e.id}>
            <div className="row-main">
              <strong>{e.title}</strong>
              <span>{e.published ? 'Published' : 'Draft'} · {toDateInput(e.created_at)}{e.tags.length ? ` · ${e.tags.map(t => '#' + t).join(' ')}` : ''}</span>
            </div>
            <div className="row-actions">
              <button className="link-btn" onClick={() => toggle(e)}>{e.published ? 'Unpublish' : 'Publish'}</button>
              <button className="link-btn" onClick={() => edit(e)}>Edit</button>
              <button className="link-btn danger" onClick={() => remove(e)}>Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------------- Tags tab ---------------- */
function TagsTab({ flash }) {
  const [tags, setTags] = useState([]);
  const [renaming, setRenaming] = useState(null);
  const [name, setName] = useState('');
  const load = () => api.get('/admin/tags').then(r => setTags(r.data)).catch(err => flash(errMsg(err, 'Could not load tags.'), true));
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function rename(from) {
    try { await api.put('/admin/tags/rename', { from, to: name }); setRenaming(null); flash('Tag renamed.'); load(); }
    catch (err) { flash(errMsg(err, 'Could not rename the tag.'), true); }
  }
  async function remove(tag) {
    if (!window.confirm(`Remove #${tag} from every entry?`)) return;
    try { await api.delete(`/admin/tags/${encodeURIComponent(tag)}`); flash('Tag removed.'); load(); }
    catch (err) { flash(errMsg(err, 'Could not remove the tag.'), true); }
  }

  return (
    <section className="card narrow">
      <h2>Tags</h2>
      <p className="muted">Tags are created when you add them to an entry. Rename or remove them here — changes apply to every entry. Renaming a tag to an existing one merges them.</p>
      {tags.length === 0 && <p className="muted">No tags yet.</p>}
      {tags.map(t => (
        <div className="row" key={t.tag}>
          {renaming === t.tag
            ? <form className="inline-form" onSubmit={e => { e.preventDefault(); rename(t.tag); }}>
                <input value={name} onChange={e => setName(e.target.value)} autoFocus required />
                <button className="btn small primary">Save</button>
                <button type="button" className="link-btn" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            : <>
                <div className="row-main"><strong>#{t.tag}</strong><span>{t.count} {t.count === 1 ? 'entry' : 'entries'}</span></div>
                <div className="row-actions">
                  <button className="link-btn" onClick={() => { setRenaming(t.tag); setName(t.tag); }}>Rename</button>
                  <button className="link-btn danger" onClick={() => remove(t.tag)}>Delete</button>
                </div>
              </>}
        </div>
      ))}
    </section>
  );
}

/* ---------------- Profile & Links tabs (site settings) ---------------- */
function ProfileTab({ draft, setDraft, save, flash }) {
  const fileRef = useRef(null);
  const set = patch => setDraft(d => ({ ...d, ...patch }));
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { set({ avatar_url: await fileToAvatar(file) }); } catch (err) { flash(err.message, true); }
  }
  return (
    <section className="card narrow">
      <h2>Profile & page text</h2>
      <form onSubmit={save}>
        <div className="avatar-edit">
          <Avatar settings={draft} size={88} />
          <div>
            <div className="btn-row">
              <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>Upload picture</button>
              {draft.avatar_url && <button type="button" className="link-btn danger" onClick={() => set({ avatar_url: '' })}>Remove</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
            <small>Square-cropped automatically. Or paste an image URL below.</small>
          </div>
        </div>
        <label>Picture URL (optional)<input value={draft.avatar_url.startsWith('data:') ? '' : draft.avatar_url} placeholder={draft.avatar_url.startsWith('data:') ? 'Using uploaded picture' : 'https://...'} onChange={e => set({ avatar_url: e.target.value })} /></label>
        <label>Name<input value={draft.site_name} onChange={e => set({ site_name: e.target.value })} required maxLength={120} /></label>
        <label>Tagline (shown under your name)<input value={draft.tagline} onChange={e => set({ tagline: e.target.value })} maxLength={300} /></label>
        <label>Page title<input value={draft.page_title} onChange={e => set({ page_title: e.target.value })} required maxLength={120} /><small>The big heading on the list page, e.g. “Musings”.</small></label>
        <label>Page description<textarea rows="3" value={draft.page_description} onChange={e => set({ page_description: e.target.value })} maxLength={1000} /></label>
        <label className="check"><input type="checkbox" checked={draft.show_tags_link} onChange={e => set({ show_tags_link: e.target.checked })} /> Add “Browse by tags.” after the description</label>
        <label>Home page intro (optional)<textarea rows="5" value={draft.home_text} onChange={e => set({ home_text: e.target.value })} placeholder="A few paragraphs about you. Separate paragraphs with a blank line." /></label>
        <button className="btn primary">Save profile</button>
      </form>
    </section>
  );
}

function LinksTab({ draft, setDraft, save }) {
  const links = draft.nav_links;
  const update = next => setDraft(d => ({ ...d, nav_links: next }));
  const patch = (i, p) => update(links.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const move = (i, dir) => { const n = [...links]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; update(n); };
  return (
    <section className="card narrow">
      <h2>Menu links</h2>
      <p className="muted">Links in the top-right menu. Use a path like <code>/musings</code> for pages on this site, or a full address like <code>https://x.com/you</code> or <code>mailto:me@example.com</code>. The RSS icon is always shown.</p>
      <form onSubmit={save}>
        {links.map((l, i) => (
          <div className="link-row" key={i}>
            <input value={l.label} onChange={e => patch(i, { label: e.target.value })} placeholder="Label" required />
            <input value={l.url} onChange={e => patch(i, { url: e.target.value })} placeholder="/musings or https://…" required />
            <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
            <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === links.length - 1} aria-label="Move down">↓</button>
            <button type="button" className="icon-btn danger" onClick={() => update(links.filter((_, j) => j !== i))} aria-label="Remove">×</button>
          </div>
        ))}
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => update([...links, { label: '', url: '' }])}>+ Add link</button>
          <button type="button" className="link-btn" onClick={() => update([{ label: 'Home', url: '/' }, { label: 'Musings', url: '/musings' }, { label: 'Tags', url: '/tags' }])}>Reset to defaults</button>
        </div>
        <button className="btn primary">Save links</button>
      </form>
    </section>
  );
}

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const nav = useNavigate();
  const { settings, loaded, setSettings } = useSettings();
  const [tab, setTab] = useState('entries');
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState(null);
  const timer = useRef();

  const flash = (text, isError = false) => {
    setMsg({ text, isError });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 5000);
  };

  useEffect(() => {
    document.title = `Admin · ${settings.site_name}`;
  }, [settings.site_name]);

  useEffect(() => {
    api.get('/auth/me').then(() => setReady(true)).catch(() => { setToken(null); nav('/admin', { replace: true }); });
  }, [nav]);

  // Keep the editable copy in sync with the saved settings until the user starts editing.
  useEffect(() => { if (loaded) setDraft(d => d ?? { ...settings, nav_links: settings.nav_links.map(l => ({ ...l })) }); }, [loaded, settings]);

  async function saveSettings(e) {
    e.preventDefault();
    try {
      const r = await api.put('/admin/settings', draft);
      setSettings(r.data);
      setDraft({ ...r.data, nav_links: r.data.nav_links.map(l => ({ ...l })) });
      flash('Saved. Your site has been updated.');
    } catch (err) { flash(errMsg(err, 'Could not save settings.'), true); }
  }

  const logout = () => { setToken(null); nav('/admin'); };
  if (!ready || !draft) return <main className="auth"><p className="muted">Loading…</p></main>;

  const tabs = [['entries', 'Entries'], ['tags', 'Tags'], ['profile', 'Profile'], ['links', 'Menu links']];
  return (
    <div className="admin">
      <header className="admin-bar">
        <strong>{settings.site_name} · Admin</strong>
        <div><Link to="/">View site ↗</Link><button className="link-btn" onClick={logout}>Sign out</button></div>
      </header>
      <main className="admin-main">
        <div className="tabs" role="tablist">
          {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>)}
        </div>
        {msg && <p className={msg.isError ? 'error' : 'success'} role="status">{msg.text}</p>}
        {tab === 'entries' && <EntriesTab flash={flash} />}
        {tab === 'tags' && <TagsTab flash={flash} />}
        {tab === 'profile' && <ProfileTab draft={draft} setDraft={setDraft} save={saveSettings} flash={flash} />}
        {tab === 'links' && <LinksTab draft={draft} setDraft={setDraft} save={saveSettings} />}
      </main>
    </div>
  );
}
