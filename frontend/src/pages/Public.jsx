import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, dateParts } from '../api.js';
import { Page } from '../components/Layout.jsx';
import EntryList from '../components/EntryList.jsx';
import { useSettings } from '../settings.jsx';

function useTitle(title) { useEffect(() => { if (title) document.title = title; }, [title]); }

function useFetch(path, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    api.get(path)
      .then(r => alive && setState({ data: r.data, error: '', loading: false }))
      .catch(e => alive && setState({ data: null, error: e.response?.status === 404 ? 'not-found' : 'Could not load content. Is the server running?', loading: false }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function Empty({ children = 'Nothing here yet.' }) { return <p className="empty">{children}</p>; }

export function Musings() {
  const { settings } = useSettings();
  const { data, error, loading } = useFetch('/entries', []);
  useTitle(`${settings.page_title} · ${settings.site_name}`);
  return (
    <Page>
      <h1 className="page-title">{settings.page_title}</h1>
      <p className="page-desc">
        {settings.page_description}
        {settings.show_tags_link && <>{settings.page_description ? ' ' : ''}Browse by <Link to="/tags">tags</Link>.</>}
      </p>
      {error && <p className="notice">{error}</p>}
      {data && (data.length ? <EntryList entries={data} /> : <Empty />)}
      {loading && <p className="empty">Loading…</p>}
    </Page>
  );
}

export function Home() {
  const { settings } = useSettings();
  const { data } = useFetch('/entries?limit=5', []);
  useTitle(settings.site_name);
  return (
    <Page>
      {settings.home_text
        ? <div className="prose home-text">{settings.home_text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
        : null}
      <div className="section-head"><h1 className="page-title">Latest {settings.page_title.toLowerCase()}</h1></div>
      {data && (data.length ? <EntryList entries={data} /> : <Empty />)}
      {data && data.length > 0 && <p className="all-link"><Link to="/musings">All {settings.page_title.toLowerCase()} →</Link></p>}
    </Page>
  );
}

export function Tags() {
  const { settings } = useSettings();
  const { data, error } = useFetch('/tags', []);
  useTitle(`Tags · ${settings.site_name}`);
  return (
    <Page>
      <h1 className="page-title">Tags</h1>
      <p className="page-desc">Browse {settings.page_title.toLowerCase()} by topic. <Link to="/musings">View all →</Link></p>
      {error && <p className="notice">{error}</p>}
      {data && (data.length
        ? <div className="tag-cloud">{data.map(t => <Link key={t.tag} to={`/tags/${encodeURIComponent(t.tag)}`}>#{t.tag} <span>{t.count}</span></Link>)}</div>
        : <Empty>No tags yet.</Empty>)}
    </Page>
  );
}

export function TagPage() {
  const { tag } = useParams();
  const { settings } = useSettings();
  const { data, error } = useFetch(`/entries?tag=${encodeURIComponent(tag)}`, [tag]);
  useTitle(`#${tag} · ${settings.site_name}`);
  return (
    <Page>
      <h1 className="page-title">#{tag}</h1>
      <p className="page-desc"><Link to="/tags">← All tags</Link></p>
      {error && <p className="notice">{error}</p>}
      {data && (data.length ? <EntryList entries={data} /> : <Empty>No entries with this tag.</Empty>)}
    </Page>
  );
}

export function EntryPage() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const { data: e, error } = useFetch(`/entries/${slug}`, [slug]);
  useTitle(e ? `${e.title} · ${settings.site_name}` : settings.site_name);
  const d = e && dateParts(e.created_at);
  return (
    <Page>
      <p className="page-desc"><Link to="/musings">← All {settings.page_title.toLowerCase()}</Link></p>
      {error && <p className="notice">{error === 'not-found' ? 'This entry could not be found.' : error}</p>}
      {e && (
        <article className="prose">
          <div className="entry-date solo">{d.day} {d.month} {d.year}</div>
          <h1 className="page-title">{e.title}</h1>
          {e.description && <p className="lead">{e.description}</p>}
          {e.url && <p><a href={e.url} target="_blank" rel="noopener noreferrer">Open original ↗</a></p>}
          <div className="content">{e.content}</div>
          {e.tags.length > 0 && <div className="entry-tags">{e.tags.map(t => <Link key={t} to={`/tags/${encodeURIComponent(t)}`}>#{t}</Link>)}</div>}
        </article>
      )}
    </Page>
  );
}

export function NotFound() {
  useTitle('Not found');
  return <Page><h1 className="page-title">Page not found</h1><p className="page-desc"><Link to="/">← Back home</Link></p></Page>;
}
