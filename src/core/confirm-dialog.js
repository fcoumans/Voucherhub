import { esc, mountOverlay, closeOverlay } from './dom.js';

export function showConfirm({ title, message, confirmLabel, confirmClass = 'btn-danger', onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
  <div class="dialog">
    <h3>${esc(title)}</h3>
    <p>${esc(message)}</p>
    <div class="dialog-actions">
      <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
      <button class="btn ${confirmClass}" id="dialog-confirm">${esc(confirmLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  mountOverlay(overlay);

  const close = () => closeOverlay(overlay);
  overlay.querySelector('#dialog-cancel').addEventListener('click', close);
  overlay.querySelector('#dialog-confirm').addEventListener('click', () => { close(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
