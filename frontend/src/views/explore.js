import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, chipGroup, emptyState, errorState, field, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { CATEGORIES, DATA_SOURCE_NOTICE, categoryLabel, placeToFormValues } from '../constants.js';

const LIMIT = 20;
const VALID_CATS = new Set(CATEGORIES.map(([k]) => k));

/** 필터를 해시 쿼리에서 읽는다(새로고침·공유 시 유지). */
function readFilters() {
  const qs = new URLSearchParams(window.location.hash.split('?')[1] || '');
  return {
    sigungu: qs.get('sigungu') || '',
    dong: qs.get('dong') || '',
    categories: qs.getAll('category').filter((c) => VALID_CATS.has(c)),
    q: (qs.get('q') || '').slice(0, 50),
  };
}

/** 라우터는 hashchange 로 다시 그리므로, 화면 갱신 없이 주소만 바꾸는 replaceState 를 쓴다. */
function writeFilters(f) {
  const qs = new URLSearchParams();
  if (f.sigungu) qs.set('sigungu', f.sigungu);
  if (f.dong) qs.set('dong', f.dong);
  f.categories.forEach((c) => qs.append('category', c));
  if (f.q) qs.set('q', f.q);
  const s = qs.toString();
  history.replaceState(null, '', `#/explore${s ? `?${s}` : ''}`);
}

const placeTitle = (p) => (p.branch_name ? `${p.name} ${p.branch_name}` : p.name);

export function exploreView(outlet, _params, ctx) {
  const filters = readFilters();
  // 이 화면에서 등록한 place_no. 서버의 already_registered 와 합쳐 배지·중복 방지에 쓴다.
  const added = new Set();
  let items = [];
  let total = 0;
  let seq = 0;
  let pick = null; // 추천 카드의 장소

  const isRegistered = (p) => p.already_registered || added.has(p.place_no);
  const apiQuery = () => ({
    sigungu: filters.sigungu || undefined,
    dong: filters.dong || undefined,
    category: filters.categories,
    q: filters.q || undefined,
  });
  const hasCondition = () => Boolean(filters.sigungu || filters.categories.length || filters.q);

  // --- 필터 컨트롤 ---
  const sigunguSel = h('select');
  const dongSel = h('select');
  const qInput = h('input', { type: 'search', placeholder: '상호명 일부 (선택)', maxlength: 50, value: filters.q });
  const includeReg = h('input', { type: 'checkbox', id: 'explore-incl' });

  function fillOptions(sel, list, blank, value) {
    sel.replaceChildren(
      h('option', { value: '' }, blank),
      ...list.map((r) => h('option', { value: r.name }, `${r.name} (${r.count.toLocaleString('ko-KR')})`)),
    );
    sel.value = list.some((r) => r.name === value) ? value : '';
  }

  async function loadDongs() {
    dongSel.disabled = !filters.sigungu;
    if (!filters.sigungu) return fillOptions(dongSel, [], '동 전체', '');
    try {
      const res = await api.placeRegions({ sigungu: filters.sigungu });
      if (!ctx.isCurrent()) return;
      fillOptions(dongSel, res.items, '동 전체', filters.dong);
      if (dongSel.value !== filters.dong) { filters.dong = dongSel.value; writeFilters(filters); }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function loadSigungus() {
    try {
      const res = await api.placeRegions({});
      if (!ctx.isCurrent()) return;
      fillOptions(sigunguSel, res.items, '시군구 전체', filters.sigungu);
      if (sigunguSel.value !== filters.sigungu) { filters.sigungu = sigunguSel.value; filters.dong = ''; }
      await loadDongs();
      refilter();
    } catch (e) {
      listBox.replaceChildren(errorState(e, loadSigungus));
    }
  }

  // --- 등록 ---
  async function addToList(p, btn) {
    if (isRegistered(p) || btn.disabled) return;
    btn.disabled = true;
    try {
      // 공공데이터 -> 폼 값 매핑 규칙(PRD 5.11.4)을 재사용한다. 상태는 가보고 싶음.
      await api.createRestaurant({ ...placeToFormValues(p), status: 'WISHLIST' });
      added.add(p.place_no);
      showToast(`"${placeTitle(p)}"을(를) 내 목록에 추가했어요.`, 'success');
      renderList();
      renderPick();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  function addControl(p) {
    if (isRegistered(p)) return badge('내 목록에 있음', 'badge-regular');
    const btn = h('button', { type: 'button', class: 'btn', 'aria-label': `${placeTitle(p)} 내 목록에 추가` }, '내 목록에 추가');
    btn.addEventListener('click', () => addToList(p, btn));
    return btn;
  }

  // --- 목록 ---
  const listBox = h('div', { class: 'list-box', 'aria-live': 'polite' });
  const pickBox = h('div', { class: 'explore-pick' });

  function placeRow(p) {
    return h('li', { class: 'card item explore-item' }, [
      h('div', { class: 'item-main' }, [
        h('h2', { class: 'item-name' }, placeTitle(p)),
        h('div', { class: 'badges' }, [
          badge(categoryLabel(p.category), 'badge-cat'),
          p.industry_small && badge(p.industry_small),
          isRegistered(p) && badge('내 목록에 있음', 'badge-regular'),
        ]),
        h('p', { class: 'muted small' }, p.location || '주소 정보 없음'),
      ]),
      isRegistered(p) ? null : addControl(p),
    ]);
  }

  function renderList() {
    if (!hasCondition()) {
      listBox.replaceChildren(emptyState('지역이나 카테고리를 골라 주세요', '시군구, 카테고리, 키워드 중 하나를 고르면 식당 목록이 나와요.'));
      return;
    }
    if (items.length === 0) {
      listBox.replaceChildren(emptyState('조건에 맞는 식당이 없어요', '필터를 바꿔 보세요.'));
      return;
    }
    const nodes = [
      h('p', { class: 'explore-total', role: 'status' }, `총 ${total.toLocaleString('ko-KR')}건`),
      h('ul', { class: 'cards' }, items.map(placeRow)),
    ];
    if (items.length < total) {
      const more = h('button', { type: 'button', class: 'btn' }, `더 보기 (${items.length.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')})`);
      more.addEventListener('click', () => { more.disabled = true; load(true); });
      nodes.push(h('div', { class: 'explore-more' }, more));
    }
    listBox.replaceChildren(...nodes);
  }

  async function load(append = false) {
    const my = ++seq;
    if (!append) {
      items = [];
      total = 0;
      if (!hasCondition()) return renderList();
      listBox.replaceChildren(spinner());
    }
    try {
      const res = await api.browsePlaces({ ...apiQuery(), offset: items.length, limit: LIMIT });
      if (my !== seq || !ctx.isCurrent()) return;
      items = items.concat(res.items);
      total = res.total;
      renderList();
    } catch (e) {
      if (my !== seq) return;
      listBox.replaceChildren(errorState(e, () => load(append)));
    }
  }

  function refilter() {
    writeFilters(filters);
    pick = null;
    renderPick();
    load(false);
  }

  // --- 추천 ---
  function renderPick() {
    if (!pick) return pickBox.replaceChildren();
    if (pick === 'none') {
      pickBox.replaceChildren(emptyState('조건에 맞는 곳이 없어요', '필터를 바꾸거나 "이미 내 목록에 있는 곳도 포함"을 켜 보세요.'));
      return;
    }
    const again = h('button', { type: 'button', class: 'btn' }, '다시 뽑기');
    again.addEventListener('click', doPick);
    pickBox.replaceChildren(
      h('div', { class: 'card item' }, [
        h('div', { class: 'item-main' }, [
          h('p', { class: 'muted small' }, '이 조건에서 뽑힌 곳'),
          h('h2', { class: 'item-name' }, placeTitle(pick)),
          h('div', { class: 'badges' }, [
            badge(categoryLabel(pick.category), 'badge-cat'),
            pick.industry_small && badge(pick.industry_small),
            isRegistered(pick) && badge('내 목록에 있음', 'badge-regular'),
          ]),
          h('p', { class: 'muted small' }, pick.location || '주소 정보 없음'),
          h('div', { class: 'actions' }, [again, addControl(pick)]),
        ]),
      ]),
    );
  }

  async function doPick() {
    try {
      const p = await api.randomPlace({ ...apiQuery(), exclude_registered: !includeReg.checked });
      pick = p;
    } catch (e) {
      if (e.status !== 404) return showToast(e.message, 'error');
      pick = 'none';
    }
    if (!ctx.isCurrent()) return;
    renderPick();
  }

  // --- 이벤트 ---
  sigunguSel.addEventListener('change', async () => {
    filters.sigungu = sigunguSel.value;
    filters.dong = '';
    await loadDongs();
    refilter();
  });
  dongSel.addEventListener('change', () => { filters.dong = dongSel.value; refilter(); });
  const cats = chipGroup({
    legend: '카테고리', name: 'xcat', options: CATEGORIES, selected: filters.categories,
    onChange: (v) => { filters.categories = v; refilter(); },
  });
  const pickBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '이 조건에서 추천받기');
  pickBtn.addEventListener('click', doPick);

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('div', { class: 'page-head' }, h('h1', {}, '동네 식당 둘러보기')),
      h('form', {
        class: 'panel', role: 'search',
        onSubmit: (e) => { e.preventDefault(); filters.q = qInput.value.trim(); refilter(); },
      }, [
        h('div', { class: 'row-fields' }, [
          field({ label: '시군구', control: sigunguSel }),
          field({ label: '동', control: dongSel }),
        ]),
        cats,
        h('div', { class: 'search-row' }, [
          h('label', { for: 'explore-q', class: 'sr-only' }, '상호명 키워드'),
          Object.assign(qInput, { id: 'explore-q' }),
          h('button', { class: 'btn', type: 'submit' }, '검색'),
        ]),
        h('div', { class: 'check' }, [includeReg, h('label', { for: 'explore-incl' }, '이미 내 목록에 있는 곳도 추천에 포함')]),
        pickBtn,
      ]),
      pickBox,
      listBox,
      h('p', { class: 'hint source explore-source' }, DATA_SOURCE_NOTICE),
    ]),
  );
  loadSigungus();
  return () => { seq++; };
}
