import { h } from './dom.js';
import { icon } from './icon.js';

const TOAST_ICONS = { success: 'circle-check', error: 'circle-x', info: 'info' };

export function showToast(message, type = 'info', ms = 4000) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast toast-${type}` }, [icon(TOAST_ICONS[type] || 'info'), h('span', {}, message)]);
  host.append(el);
  setTimeout(() => el.remove(), ms);
}
