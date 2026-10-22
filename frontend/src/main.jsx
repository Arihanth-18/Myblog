import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from './settings.jsx';
import { EntryPage, Home, Musings, NotFound, TagPage, Tags } from './pages/Public.jsx';
import { Dashboard, Login } from './pages/Admin.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/musings" element={<Musings />} />
          <Route path="/musings/:slug" element={<EntryPage />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/tags/:tag" element={<TagPage />} />
          <Route path="/admin" element={<Login />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SettingsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
