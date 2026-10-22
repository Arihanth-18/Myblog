import { Link, NavLink } from 'react-router-dom';
import { RSS_URL } from '../api.js';
import { useSettings } from '../settings.jsx';

export function SmartLink({ to, children, ...rest }) {
  if (/^\/(?!\/)/.test(to)) return <Link to={to} {...rest}>{children}</Link>;
  const external = /^https?:/i.test(to);
  return <a href={to} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>{children}</a>;
}

export function Avatar({ settings, size = 94 }) {
  const initial = (settings.site_name || '?').trim().charAt(0).toUpperCase();
  return settings.avatar_url
    ? <img className="avatar" style={{ width: size, height: size }} src={settings.avatar_url} alt={settings.site_name} />
    : <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{initial}</div>;
}

export function Header() {
  const { settings } = useSettings();
  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <Avatar settings={settings} />
        <div>
          <div className="brand-name">{settings.site_name}</div>
          {settings.tagline && <div className="brand-tagline">{settings.tagline}</div>}
        </div>
      </Link>
      <nav className="site-nav" aria-label="Main">
        {settings.nav_links.map((l, i) => (
          /^\/(?!\/)/.test(l.url)
            ? <NavLink key={i} to={l.url} end={l.url === '/'}>{l.label}</NavLink>
            : <SmartLink key={i} to={l.url}>{l.label}</SmartLink>
        ))}
        <a className="rss" href={RSS_URL} aria-label="RSS feed" title="RSS feed">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="19" r="2.6" /><path d="M2.4 9.4v3.6A8.6 8.6 0 0 1 11 21.6h3.6A12.2 12.2 0 0 0 2.4 9.4z" /><path d="M2.4 2.4V6a15.6 15.6 0 0 1 15.6 15.6h3.6A19.2 19.2 0 0 0 2.4 2.4z" />
          </svg>
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  const { settings } = useSettings();
  return <footer className="site-footer">© {new Date().getFullYear()} {settings.site_name}</footer>;
}

export function Page({ children }) {
  return <><Header /><main className="container">{children}</main><Footer /></>;
}
