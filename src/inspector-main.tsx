import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InspectorApp } from './InspectorApp';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-inspector.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InspectorApp />
  </StrictMode>,
);
