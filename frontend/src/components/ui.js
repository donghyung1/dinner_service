import { h, nextId } from './dom.js';
import { api } from '../api/client.js';
import { showToast } from './toast.js';
import { icon, iconButton } from './icon.js';
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
    onRetry && iconButton({ name: 'rotate-cw', label: '다시 시도', onClick: onRetry }),
  ]);
}

export function visitTabs(active) {
  const tab = (key, href, iconName, text) =>
    h('a', { class: 'tab', href, 'aria-label': text, title: text, ...(active === key ? { 'aria-current': 'page' } : {}) }, icon(iconName));
  return h('nav', { class: 'tabs', 'aria-label': '기록 보기' }, [
    tab('list', '#/visits', 'list', '방문 기록'),
    tab('stats', '#/visits/stats', 'chart', '월간 회고'),
  ]);
}

/** 배지. iconName 이 있으면 앞에 아이콘을 붙이고, iconOnly 면 글자는 sr-only + title 로만 둔다. */
export function badge(text, kind = '', { icon: iconName, iconOnly = false } = {}) {
  if (iconName && iconOnly) {
    return h('span', { class: `badge badge-icon ${kind}`.trim(), title: text }, [icon(iconName), h('span', { class: 'sr-only' }, text)]);
  }
  return h('span', { class: `badge ${kind}`.trim() }, [iconName && icon(iconName), h('span', {}, text)]);
}

export function restaurantBadges(r) {
  return h('div', { class: 'badges' }, [
    badge(categoryLabel(r.category), 'badge-cat', { icon: 'utensils' }),
    r.price_level != null && badge(priceLabel(r.price_level), 'badge-price', { icon: 'wallet' }),
    badge(statusLabel(r.status), r.status === 'REGULAR' ? 'badge-regular' : 'badge-wish', {
      icon: r.status === 'REGULAR' ? 'repeat' : 'bookmark',
      iconOnly: true,
    }),
    r.is_expiring && badge('곧 잊혀짐', 'badge-expiring', { icon: 'hourglass', iconOnly: true }),
  ]);
}

/**
 * "목록에서 뺄까요?" 제안 영역. r.skip_suggestion 이 아니면 null.
 * [삭제]는 확인 모달 후 삭제하고 onDone('deleted'), [그대로 두기]는 제안을 숨기고 onDone('dismissed') 를 호출한다.
 */
export function skipSuggestion(r, onDone) {
  if (!r.skip_suggestion) return null;
  const del = iconButton({ name: 'trash', label: `${r.name} 삭제`, cls: 'btn btn-danger-ghost' });
  del.title = '삭제';
  const keep = iconButton({ name: 'check', label: `${r.name} 그대로 두기`, text: '그대로 두기' });
  const box = h('div', { class: 'suggest', role: 'group', 'aria-label': '목록 정리 제안' }, [
    h('p', { class: 'suggest-title' }, '목록에서 뺄까요?'),
    h('p', { class: 'muted small' }, `최근 ${r.consecutive_skips ?? 5}번 연속으로 넘겼어요.`),
    h('div', { class: 'actions' }, [del, keep]),
  ]);
  del.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '식당을 삭제할까요?',
      message: `"${r.name}"과(와) 연결된 방문 기록도 함께 삭제돼요.`,
      confirmText: '삭제',
      danger: true,
    });
    if (!ok) return;
    del.disabled = true;
    try {
      await api.deleteRestaurant(r.id);
      showToast('삭제했어요.', 'success');
      onDone?.('deleted');
    } catch (e) {
      del.disabled = false;
      showToast(e.message, 'error');
    }
  });
  keep.addEventListener('click', async () => {
    keep.disabled = true;
    try {
      await api.dismissSkipSuggestion(r.id);
      r.skip_suggestion = false;
      box.remove();
      onDone?.('dismissed');
    } catch (e) {
      keep.disabled = false;
      showToast(e.message, 'error');
    }
  });
  return box;
}

export function favoriteButton(r, onChange) {
  const btn = h('button', { type: 'button', class: 'fav' });
  const paint = () => {
    btn.replaceChildren(icon('star', { size: '1.5em' }));
    btn.classList.toggle('is-on', Boolean(r.is_favorite));
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
export function field({ label, control, hint, required, icon: iconName }) {
  const id = control.id || nextId('f');
  control.id = id;
  const err = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert' });
  control.setAttribute('aria-describedby', `${id}-err`);
  const wrap = h('div', { class: 'field' }, [
    h('label', { for: id }, [iconName && icon(iconName), label, required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')]),
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
    const ok = h('button', { type: 'button', class: danger ? 'btn btn-danger' : 'btn btn-primary' }, [
      icon(danger ? 'trash' : 'check'),
      h('span', {}, confirmText),
    ]);
    const cancel = iconButton({ name: 'x', label: '취소' });
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
    iconButton({ name: 'chevron-left', label: '이전', disabled: page <= 1, onClick: () => onPage(offset - limit) }),
    h('span', { 'aria-live': 'polite', title: `총 ${total}건` }, [`${page} / ${pages}`, h('span', { class: 'sr-only' }, ` (총 ${total}건)`)]),
    iconButton({ name: 'chevron-right', label: '다음', disabled: page >= pages, onClick: () => onPage(offset + limit) }),
  ]);
}
