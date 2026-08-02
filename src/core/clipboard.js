import { icon } from './ui.js';

export function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// Inline copy confirmation on the button itself — darkens and swaps its
// label to "Copied" for a moment, then reverts. Replaces a bottom toast as
// the copy signal, since the toast reads as far from where the user's
// attention (and thumb) already is.
export function flashCopied(button, { label = 'Copied', duration = 1600, onRevert } = {}) {
  if (!button || button.classList.contains('btn-copied')) return;
  const original = button.innerHTML;
  button.classList.add('btn-copied');
  button.disabled = true;
  button.innerHTML = `${icon.check} ${label}`;
  setTimeout(() => {
    button.classList.remove('btn-copied');
    button.disabled = false;
    button.innerHTML = original;
    if (onRevert) onRevert();
  }, duration);
}
