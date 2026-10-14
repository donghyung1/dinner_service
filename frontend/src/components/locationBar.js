import { api } from '../api/client.js';
import { h } from './dom.js';
import { field, selectEl } from './ui.js';
import { showToast } from './toast.js';

const STORAGE_KEY = 'dinner.location';

/** 저장된 내 위치 {sigungu, dong}. 없거나 깨졌으면 null. dong 은 빈 값(동 전체)일 수 있다. */
export function loadLocation() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw.sigungu !== 'string' || !raw.sigungu) return null;
    return { sigungu: raw.sigungu, dong: typeof raw.dong === 'string' ? raw.dong : '' };
  } catch {
    return null;
  }
}

export function saveLocation(loc) {
  try {
    if (loc) localStorage.setItem(STORAGE_KEY, JSON.stringify({ sigungu: loc.sigungu, dong: loc.dong || '' }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

export const locationLabel = (loc) => (loc ? `${loc.sigungu}${loc.dong ? ` ${loc.dong}` : ''}` : '');

const fmt = (n) => n.toLocaleString('ko-KR');

/**
 * 추천 화면 상단의 "내 위치" 표시/선택 영역. 위치는 localStorage 에만 저장한다.
 * onChange(loc) 는 저장 직후 호출된다(loc 은 null 일 수 있음).
 */
export function locationBar({ isCurrent, onChange }) {
  let loc = loadLocation();
  const box = h('div', { class: 'location-bar' });

  function fill(sel, list, blank, value) {
    sel.replaceChildren(
      h('option', { value: '' }, blank),
      ...list.map((r) => h('option', { value: r.name }, `${r.name} (${fmt(r.count)})`)),
    );
    sel.value = list.some((r) => r.name === value) ? value : '';
  }

  function renderView() {
    if (!loc) {
      box.replaceChildren(
        h('span', { class: 'muted' }, '위치를 정하면 근처 식당을 추천해요 '),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderEdit }, '위치 정하기'),
      );
      return;
    }
    box.replaceChildren(
      h('span', { class: 'location-label' }, `📍 ${locationLabel(loc)}`),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: renderEdit }, '변경'),
    );
  }

  function renderEdit() {
    const sigunguSel = selectEl([], '', { blank: '불러오는 중…' });
    const dongSel = selectEl([], '', { blank: '시군구를 먼저 선택' });
    dongSel.disabled = true;
    let seq = 0;

    async function loadDongs(value) {
      const my = ++seq;
      dongSel.disabled = !sigunguSel.value;
      if (!sigunguSel.value) return fill(dongSel, [], '시군구를 먼저 선택', '');
      try {
        const res = await api.placeRegions({ sigungu: sigunguSel.value, group: true });
        if (my !== seq || !isCurrent()) return;
        fill(dongSel, res.items, '동 전체', value);
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    sigunguSel.addEventListener('change', () => loadDongs(''));

    const save = h('button', { type: 'submit', class: 'btn btn-primary' }, '저장');
    const cancel = h('button', { type: 'button', class: 'btn', onClick: renderView }, '취소');
    const clear = h('button', {
      type: 'button',
      class: 'btn btn-danger-ghost',
      hidden: !loc,
      onClick: () => { loc = null; saveLocation(null); renderView(); onChange(null); },
    }, '위치 해제');

    box.replaceChildren(
      h('form', {
        class: 'location-edit',
        onSubmit: (e) => {
          e.preventDefault();
          if (!sigunguSel.value) { sigunguSel.focus(); return; }
          loc = { sigungu: sigunguSel.value, dong: dongSel.value };
          saveLocation(loc);
          renderView();
          onChange(loc);
        },
      }, [
        h('div', { class: 'row-fields' }, [
          field({ label: '시군구', control: sigunguSel }),
          field({ label: '동', control: dongSel }),
        ]),
        h('div', { class: 'actions' }, [save, cancel, clear]),
      ]),
    );

    api.placeRegions({}).then(async (res) => {
      if (!isCurrent()) return;
      fill(sigunguSel, res.items, '시군구 선택', loc?.sigungu ?? '');
      await loadDongs(loc?.dong ?? '');
    }).catch((e) => showToast(e.message, 'error'));
  }

  renderView();
  return {
    el: box,
    get: () => loc,
  };
}
