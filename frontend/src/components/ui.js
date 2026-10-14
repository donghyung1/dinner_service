import { h, nextId } from './dom.js';
import { api } from '../api/client.js';
import { showToast } from './toast.js';
import { categoryLabel, priceLabel, statusLabel } from '../constants.js';

export function spinner(label = '불러오는 중…') {
  return h('div', { class: 'state state-loading', role: 'status' }, [
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    h('span', {}, label),
  ]);
}

export function emptyState(title, desc, action) {
  return h('div', { class: 'state state-empty' }, [
    h('p', { class: 'state-title' }, title),
    desc && h('p', { class: 'muted' }, desc),
    action,
  ]);
}

export function errorState(err, onRetry) {
  return h('div', { class: 'state state-error', role: 'alert' }, [
    h('p', { class: 'state-title' }, '문제가 생겼어요'),
    h('p', { class: 'muted' }, err?.message || '알 수 없는 오류'),
    onRetry && h('button', { type: 'button', class: 'btn', onClick: onRetry }, '다시 시도'),
  ]);
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}`.trim() }, text);
}

export function restaurantBadges(r) {
  return h('div', { class: 'badges' }, [
    badge(categoryLabel(r.category), 'badge-cat'),
    r.price_level != null && badge(priceLabel(r.price_level)),
    badge(statusLabel(r.status), r.status === 'REGULAR' ? 'badge-regular' : 'badge-wish'),
  ]);
}

export function favoriteButton(r, onChange) {
  const btn = h('button', { type: 'button', class: 'fav' });
  const paint = () => {
    btn.textContent = r.is_favorite ? '★' : '☆';
    btn.setAttribute('aria-pressed', String(r.is_favorite));
    btn.setAttribute('aria-label', `${r.name} 즐겨찾기`);
    btn.title = r.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가';
  };
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const updated = await api.setFavorite(r.id, !r.is_favorite);
      r.is_favorite = updated.is_favorite;
      paint();
      onChange?.(r);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  paint();
  return btn;
}

/** 칩 그룹. type: 'checkbox' (복수) | 'radio' (단일). */
export function chipGroup({ legend, name, options, type = 'checkbox', selected = [], onChange }) {
  const sel = new Set(selected.map(String));
  const fs = h('fieldset', { class: 'chips' }, h('legend', {}, legend));
  const wrap = h('div', { class: 'chip-row' });
  for (const [value, label] of options) {
    const id = nextId('chip');
    const input = h('input', {
      type,
      id,
      name: type === 'radio' ? name : `${name}-${value}`,
      value: String(value),
      checked: sel.has(String(value)),
    });
    input.addEventListener('change', () => onChange?.(getValues()));
    wrap.append(h('span', { class: 'chip' }, [input, h('label', { for: id }, label)]));
  }
  fs.append(wrap);
  function getValues() {
    return [...wrap.querySelectorAll('input:checked')].map((i) => i.value);
  }
  fs.getValues = getValues;
  return fs;
}

/** 라벨이 붙은 입력 필드. 오류 메시지는 aria-describedby 로 연결된다. */
export function field({ label, control, hint, required }) {
  const id = control.id || nextId('f');
  control.id = id;
  const err = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert' });
  control.setAttribute('aria-describedby', `${id}-err`);
  const wrap = h('div', { class: 'field' }, [
    h('label', { for: id }, [label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')]),
    control,
    hint && h('p', { class: 'hint' }, hint),
    err,
  ]);
  wrap.setError = (msg) => {
    err.textContent = msg || '';
    if (msg) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  };
  return wrap;
}

export function selectEl(options, value, { blank } = {}) {
  const s = h('select');
  if (blank !== undefined) s.append(h('option', { value: '' }, blank));
  for (const [v, l] of options) s.append(h('option', { value: String(v), selected: String(v) === String(value) }, l));
  if (value !== undefined && value !== null) s.value = String(value);
  return s;
}

/** 확인 모달. Promise<boolean> 반환. */
export function confirmDialog({ title, message, confirmText = '확인', danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const titleId = nextId('dlg');
    const ok = h('button', { type: 'button', class: danger ? 'btn btn-danger' : 'btn btn-primary' }, confirmText);
    const cancel = h('button', { type: 'button', class: 'btn' }, '취소');
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
      h('h2', { id: titleId }, title),
      h('p', {}, message),
      h('div', { class: 'actions' }, [cancel, ok]),
    ]);
    const overlay = h('div', { class: 'overlay' }, box);
    const close = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Tab') {
        const items = [cancel, ok];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    ok.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => e.target === overlay && close(false));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    cancel.focus();
  });
}

export function pager({ total, limit, offset, onPage }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return h('nav', { class: 'pager', 'aria-label': '페이지 이동' }, [
    h('button', { type: 'button', class: 'btn', disabled: page <= 1, onClick: () => onPage(offset - limit) }, '이전'),
    h('span', { 'aria-live': 'polite' }, `${page} / ${pages} (총 ${total}건)`),
    h('button', { type: 'button', class: 'btn', disabled: page >= pages, onClick: () => onPage(offset + limit) }, '다음'),
  ]);
}
