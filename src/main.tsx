import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);

// Lets Android's Share menu send screenshots to the Dump tab (see public/sw.js). Production only: it needs https and an installed app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
