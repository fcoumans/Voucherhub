import './style.css';
import './app.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(err => {
      console.error('SW registration failed:', err);
    });
  });
}
