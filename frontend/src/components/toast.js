import { h } from './dom.js';

export function showToast(message, type = 'info', ms = 4000) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast toast-${type}` }, message);
  host.append(el);
  setTimeout(() => el.remove(), ms);
}
