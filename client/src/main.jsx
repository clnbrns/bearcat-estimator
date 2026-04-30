import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import PartnerPortal from './components/PartnerPortal.jsx';
import PartnerAdmin from './components/PartnerAdmin.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/partners/:slug" element={<PartnerPortal />} />
      <Route path="/admin/partners" element={<PartnerAdmin />} />
    </Routes>
  </BrowserRouter>
);
