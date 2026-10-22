import { Link } from 'react-router-dom';
import { dateParts, hostOf } from '../api.js';

export default function EntryList({ entries }) {
  return (
    <div className="entries">
      {entries.map(e => {
        const { day, month, year } = dateParts(e.created_at);
        const internal = `/musings/${e.slug}`;
        return (
          <article className="entry" key={e.id}>
            <div className="entry-date"><span className="day">{day}</span> <span className="my">{month} {year}</span></div>
            <div className="entry-body">
              <h2 className="entry-title">
                {e.url
                  ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a>
                  : e.has_content ? <Link to={internal}>{e.title}</Link> : <span className="plain">{e.title}</span>}
              </h2>
              {e.url && <div className="entry-source">{hostOf(e.url)}</div>}
              {e.description && <p className="entry-desc">{e.description}</p>}
              {e.tags.length > 0 && (
                <div className="entry-tags">
                  {e.tags.map(t => <Link key={t} to={`/tags/${encodeURIComponent(t)}`}>#{t}</Link>)}
                  {e.url && e.has_content && <Link className="more" to={internal}>Notes →</Link>}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
