import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

export const FALLBACK = {
  site_name: 'Musings', tagline: '', avatar_url: '', page_title: 'Musings', page_description: '',
  show_tags_link: true, home_text: '', nav_links: [{ label: 'Home', url: '/' }, { label: 'Musings', url: '/musings' }],
};

const Ctx = createContext({ settings: FALLBACK, loaded: false, setSettings: () => {}, refresh: () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => api.get('/settings').then(r => { setSettings({ ...FALLBACK, ...r.data }); setLoaded(true); }).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ settings, loaded, setSettings, refresh }}>{children}</Ctx.Provider>;
}
