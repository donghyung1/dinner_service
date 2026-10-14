import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, chipGroup, emptyState, errorState, favoriteButton, field, restaurantBadges, selectEl, skipSuggestion, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { CATEGORIES, PRICES, SORTS, STATUSES, categoryLabel, placeToFormValues } from '../constants.js';

const LIMIT = 20;
const VALID_CATS = new Set(CATEGORIES.map(([k]) => k));
const VALID_PRICES = new Set(PRICES.map(([k]) => String(k)));
const VALID_STATUS = new Set(STATUSES.map(([k]) => k));
const VALID_SORT = new Set(SORTS.map(([k]) => k));
const DEFAULT_SORT = 'created_desc';

// 사이드 이동(상세 등) 후 메뉴로 다시 들어와도 조건이 유지되도록 모듈 범위에 마지막 조건을 보관한다.
let saved = null;

/** 필터를 해시 쿼리에서 읽는다. 쿼리가 없으면 마지막 조건을 쓴다. */
function readFilters() {
  const raw = window.location.hash.split('?')[1];
  if (!raw && saved) return { ...saved, categories: [...saved.categories], prices: [...saved.prices] };
  const qs = new URLSearchParams(raw || '');
  const status = qs.get('status') || '';
  const sort = qs.get('sort') || '';
  return {
    q: (qs.get('q') || '').slice(0, 100),
    categories: qs.getAll('category').filter((c) => VALID_CATS.has(c)),
    sigungu: qs.get('sigungu') || '',
    dong: qs.get('dong') || '',
    status: VALID_STATUS.has(status) ? status : '',
    prices: qs.getAll('price_level').filter((p) => VALID_PRICES.has(p)),
    fav: qs.get('fav') === '1',
    sort: VALID_SORT.has(sort) ? sort : DEFAULT_SORT,
  };
}

/** 라우터는 hashchange 로 다시 그리므로, 화면 갱신 없이 주소만 바꾸는 replaceState 를 쓴다. */
function writeFilters(f) {
  saved = f;
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  f.categories.forEach((c) => qs.append('category', c));
  if (f.sigungu) qs.set('sigungu', f.sigungu);
  if (f.dong) qs.set('dong', f.dong);
  if (f.status) qs.set('status', f.status);
  f.prices.forEach((p) => qs.append('price_level', p));
  if (f.fav) qs.set('fav', '1');
  if (f.sort !== DEFAULT_SORT) qs.set('sort', f.sort);
  const s = qs.toString();
  history.replaceState(null, '', `#/restaurants${s ? `?${s}` : ''}`);
}

const placeTitle = (p) => (p.branch_name ? `${p.name} ${p.branch_name}` : p.name);
const itemKey = (it) => (it.kind === 'mine' ? `m${it.id}` : `p${it.place_no}`);
const fmt = (n) => n.toLocaleString('ko-KR');

export function restaurantListView(outlet, _params, ctx) {
  const filters = readFilters();
  let items = [];
  let total = 0;
  let mineTotal = 0;
  let placeTotal = 0;
  let seq = 0;
  let pick = null; // 추천 카드의 항목, 'none' 이면 후보 없음

  const hasPlaceCondition = () => Boolean(filters.q || filters.categories.length || filters.sigungu || filters.dong);
  const hasDetail = () => Boolean(filters.status || filters.prices.length || filters.fav);
  const apiQuery = () => ({
    q: filters.q || undefined,
    category: filters.categories,
    sigungu: filters.sigungu || undefined,
    dong: filters.dong || undefined,
    status: filters.status || undefined,
    price_level: filters.prices,
    is_favorite: filters.fav ? true : undefined,
  });

  const listBox = h('div', { class: 'list-box', 'aria-live': 'polite' });
  const pickBox = h('div', { class: 'list-pick' });

  // --- 필터 컨트롤 ---
  const sigunguSel = h('select');
  const dongSel = h('select', { disabled: true });
  dongSel.append(h('option', { value: '' }, '시군구를 먼저 선택'));
  const qInput = h('input', { type: 'search', id: 'q', value: filters.q, placeholder: '이름·메모 검색', maxlength: 100 });
  const statusSel = selectEl(STATUSES, filters.status, { blank: '전체' });
  const sortSel = selectEl(SORTS, filters.sort);
  const favInput = h('input', { type: 'checkbox', id: 'fav', checked: filters.fav });
  const mineOnly = h('input', { type: 'checkbox', id: 'mine-only' });

  function fillOptions(sel, list, blank, value) {
    sel.replaceChildren(
      h('option', { value: '' }, blank),
      ...list.map((r) => h('option', { value: r.name }, `${r.name} (${fmt(r.count)})`)),
    );
    sel.value = list.some((r) => r.name === value) ? value : '';
  }

  let dongSeq = 0;
  async function loadDongs() {
    const my = ++dongSeq;
    dongSel.disabled = !filters.sigungu;
    if (!filters.sigungu) return fillOptions(dongSel, [], '시군구를 먼저 선택', '');
    try {
      const res = await api.placeRegions({ sigungu: filters.sigungu });
      // 시군구를 연달아 바꿨을 때 늦게 도착한 이전 응답이 동 목록을 덮어쓰지 않게 한다.
      if (my !== dongSeq || !ctx.isCurrent()) return;
      fillOptions(dongSel, res.items, '동 전체', filters.dong);
      filters.dong = dongSel.value;
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
      if (!ctx.isCurrent()) return;
      refilter();
    } catch (e) {
      // 지역 목록을 못 받아도 내 식당 목록은 보여 준다.
      showToast(e.message, 'error');
      refilter();
    }
  }

  // --- 항목 ---
  async function addPlace(p, btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      // 공공데이터 -> 폼 값 매핑 규칙(PRD 5.11.4)을 재사용한다. 상태는 가보고 싶음.
      const created = await api.createRestaurant({ ...placeToFormValues(p), status: 'WISHLIST' });
      const mine = { ...created, kind: 'mine' };
      items = items.map((it) => (it.kind === 'place' && it.place_no === p.place_no ? mine : it));
      if (pick && pick !== 'none' && pick.kind === 'place' && pick.place_no === p.place_no) pick = mine;
      mineTotal += 1;
      placeTotal = Math.max(0, placeTotal - 1);
      showToast(`"${placeTitle(p)}"을(를) 내 식당에 추가했어요.`, 'success');
      renderList();
      renderPick();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  function addButton(p) {
    const btn = h('button', { type: 'button', class: 'btn', 'aria-label': `${placeTitle(p)} 내 식당에 추가` }, '추가');
    btn.addEventListener('click', () => addPlace(p, btn));
    return btn;
  }

  function mineRow(r) {
    return h('li', { class: 'card item' }, [
      h('div', { class: 'item-main' }, [
        h('h2', { class: 'item-name' }, h('a', { href: `#/restaurants/${r.id}` }, r.name)),
        restaurantBadges(r),
        r.location && h('p', { class: 'muted small' }, r.location),
        skipSuggestion(r, (kind) => kind === 'deleted' && load()),
      ]),
      favoriteButton(r),
    ]);
  }

  const placeBadges = (p) =>
    h('div', { class: 'badges' }, [badge(categoryLabel(p.category), 'badge-cat'), p.industry_small && badge(p.industry_small)]);

  function placeRow(p) {
    return h('li', { class: 'card item list-place' }, [
      h('div', { class: 'item-main' }, [
        h('h2', { class: 'item-name' }, placeTitle(p)),
        placeBadges(p),
        h('p', { class: 'muted small' }, p.location || '주소 정보 없음'),
      ]),
      addButton(p),
    ]);
  }

  // --- 목록 ---
  function summary() {
    const parts = [`내 식당 ${fmt(mineTotal)}곳`];
    if (placeTotal > 0) parts.push(`동네 식당 ${fmt(placeTotal)}곳`);
    return parts.join(' · ');
  }

  function renderList() {
    if (total === 0 && items.length === 0) {
      const filtered = hasPlaceCondition() || hasDetail();
      listBox.replaceChildren(
        emptyState(
          filtered ? '조건에 맞는 식당이 없어요' : '아직 등록한 식당이 없어요',
          filtered ? '검색어나 필터를 바꿔 보세요.' : '지역이나 카테고리를 골라 동네 식당을 찾아보세요.',
          filtered ? null : h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: '#/restaurants/new' }, '+ 직접 추가')),
        ),
      );
      return;
    }
    const nodes = [h('p', { class: 'list-total', role: 'status' }, summary())];
    if (!hasPlaceCondition() && !hasDetail()) {
      nodes.push(h('p', { class: 'muted small list-hint' }, '지역이나 카테고리를 고르면 동네 식당도 함께 보여요.'));
    }
    nodes.push(h('ul', { class: 'cards' }, items.map((it) => (it.kind === 'mine' ? mineRow(it) : placeRow(it)))));
    if (items.length < total) {
      const more = h('button', { type: 'button', class: 'btn' }, `더 보기 (${fmt(items.length)} / ${fmt(total)})`);
      more.addEventListener('click', () => { more.disabled = true; load(true); });
      nodes.push(h('div', { class: 'list-more' }, more));
    }
    listBox.replaceChildren(...nodes);
  }

  async function load(append = false) {
    const my = ++seq;
    if (!append) {
      listBox.setAttribute('aria-busy', 'true');
      listBox.replaceChildren(spinner());
    }
    try {
      const res = await api.searchRestaurants({
        ...apiQuery(), sort: filters.sort, offset: append ? items.length : 0, limit: LIMIT,
      });
      if (my !== seq || !ctx.isCurrent()) return;
      if (append) {
        // 추가로 항목 순서가 바뀐 경우를 대비해 중복은 건너뛴다.
        const seen = new Set(items.map(itemKey));
        items = items.concat(res.items.filter((it) => !seen.has(itemKey(it))));
      } else {
        items = res.items;
      }
      total = res.total;
      mineTotal = res.mine_total;
      placeTotal = res.place_total;
      renderList();
    } catch (e) {
      if (my !== seq) return;
      listBox.replaceChildren(errorState(e, () => load(append)));
    } finally {
      if (my === seq) listBox.removeAttribute('aria-busy');
    }
  }

  function refilter() {
    writeFilters({ ...filters, categories: [...filters.categories], prices: [...filters.prices] });
    pick = null;
    renderPick();
    load(false);
  }

  // --- 추천 ---
  function renderPick() {
    if (!pick) return pickBox.replaceChildren();
    if (pick === 'none') {
      pickBox.replaceChildren(
        emptyState('조건에 맞는 곳이 없어요', hasPlaceCondition() ? '필터를 바꾸거나 "내 식당만"을 꺼 보세요.' : '지역이나 카테고리를 골라 동네 식당을 찾아보세요.'),
      );
      return;
    }
    const again = h('button', { type: 'button', class: 'btn' }, '다시 뽑기');
    again.addEventListener('click', doPick);
    const mine = pick.kind === 'mine';
    pickBox.replaceChildren(
      h('div', { class: 'card item' }, [
        h('div', { class: 'item-main' }, [
          h('p', { class: 'muted small' }, '이 조건에서 뽑힌 곳'),
          h('h2', { class: 'item-name' }, mine ? pick.name : placeTitle(pick)),
          mine ? restaurantBadges(pick) : placeBadges(pick),
          (mine ? pick.location : pick.location || '주소 정보 없음') && h('p', { class: 'muted small' }, mine ? pick.location : pick.location || '주소 정보 없음'),
          h('div', { class: 'actions' }, [
            again,
            mine ? h('a', { class: 'btn', href: `#/restaurants/${pick.id}` }, '상세 보기') : addButton(pick),
          ]),
        ]),
      ]),
    );
  }

  async function doPick() {
    try {
      pick = await api.randomRestaurant({ ...apiQuery(), mine_only: mineOnly.checked ? true : undefined });
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
  sortSel.addEventListener('change', () => { filters.sort = sortSel.value; refilter(); });
  statusSel.addEventListener('change', () => { filters.status = statusSel.value; refilter(); });
  favInput.addEventListener('change', () => { filters.fav = favInput.checked; refilter(); });
  const pickBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '이 조건에서 추천받기');
  pickBtn.addEventListener('click', doPick);

  const detail = h('details', { class: 'filter-detail' }, [
    h('summary', {}, '상세 필터 (상태·가격대·즐겨찾기·정렬)'),
    chipGroup({ legend: '가격대', name: 'lprice', options: PRICES, selected: filters.prices, onChange: (v) => { filters.prices = v; refilter(); } }),
    h('div', { class: 'row-fields' }, [
      field({ label: '상태', control: statusSel }),
      field({ label: '정렬', control: sortSel }),
      h('div', { class: 'check' }, [favInput, h('label', { for: 'fav' }, '즐겨찾기만')]),
    ]),
    h('p', { class: 'hint' }, '상태·가격대·즐겨찾기를 고르면 내 식당만 보여요.'),
  ]);
  if (hasDetail() || filters.sort !== DEFAULT_SORT) detail.open = true;

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, '식당'),
        h('a', { class: 'btn btn-primary', href: '#/restaurants/new' }, '+ 식당 추가'),
      ]),
      h('form', { class: 'panel', role: 'search', onSubmit: (e) => { e.preventDefault(); filters.q = qInput.value.trim(); refilter(); } }, [
        h('div', { class: 'search-row' }, [
          h('label', { for: 'q', class: 'sr-only' }, '검색어'),
          qInput,
          h('button', { class: 'btn', type: 'submit' }, '검색'),
        ]),
        chipGroup({ legend: '카테고리', name: 'lcat', options: CATEGORIES, selected: filters.categories, onChange: (v) => { filters.categories = v; refilter(); } }),
        h('div', { class: 'row-fields' }, [
          field({ label: '시군구', control: sigunguSel }),
          field({ label: '동', control: dongSel }),
        ]),
        detail,
        h('div', { class: 'check' }, [mineOnly, h('label', { for: 'mine-only' }, '내 식당만')]),
        pickBtn,
      ]),
      pickBox,
      listBox,
    ]),
  );
  loadSigungus();
  return () => { seq++; };
}
