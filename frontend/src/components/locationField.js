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
 * 추천 조건 패널 안의 "위치" 선택 영역(시군구·동 select 가 항상 보인다).
 * 고르는 즉시 localStorage 에 저장하고, 시군구가 빈 값이면 위치 해제로 본다.
 * onChange(loc) 는 저장 직후 호출된다(loc 은 null 일 수 있음).
 */
export function locationField({ isCurrent, onChange }) {
  let loc = loadLocation();
  const sigunguSel = selectEl([], '', { blank: '불러오는 중…' });
  const dongSel = selectEl([], '', { blank: '시군구를 먼저 선택' });
  dongSel.disabled = true;
  let seq = 0;

  function fill(sel, list, blank, value) {
    sel.replaceChildren(
      h('option', { value: '' }, blank),
      ...list.map((r) => h('option', { value: r.name }, `${r.name} (${fmt(r.count)})`)),
    );
    sel.value = list.some((r) => r.name === value) ? value : '';
  }

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

  function commit() {
    loc = sigunguSel.value ? { sigungu: sigunguSel.value, dong: dongSel.value } : null;
    saveLocation(loc);
    onChange(loc);
  }

  sigunguSel.addEventListener('change', () => { loadDongs(''); commit(); });
  dongSel.addEventListener('change', commit);

  api.placeRegions({}).then(async (res) => {
    if (!isCurrent()) return;
    fill(sigunguSel, res.items, '전체 지역', loc?.sigungu ?? '');
    await loadDongs(loc?.dong ?? '');
  }).catch((e) => showToast(e.message, 'error'));

  const el = h('fieldset', {}, [
    h('legend', {}, '위치'),
    h('div', { class: 'row-fields' }, [
      field({ label: '시군구', control: sigunguSel }),
      field({ label: '동', control: dongSel }),
    ]),
  ]);
  return {
    el,
    get: () => loc,
  };
}
