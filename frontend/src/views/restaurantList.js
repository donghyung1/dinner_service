import '../styles/restaurants.css';
import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, chipGroup, emptyState, errorState, favoriteButton, field, restaurantBadges, selectEl, skipSuggestion, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { icon, iconButton } from '../components/icon.js';
import { CATEGORIES, PRICES, SORTS, STATUSES, categoryLabel, placeToFormValues } from '../constants.js';

const LIMIT = 20;
const VALID_CATS = new Set(CATEGORIES.map(([k]) => k));
const VALID_PRICES = new Set(PRICES.map(([k]) => String(k)));
const VALID_STATUS = new Set(STATUSES.map(([k]) => k));
const VALID_SORT = new Set(SORTS.map(([k]) => k));
const DEFAULT_SORT = 'created_desc';
const RECOMMEND_KEY = 'dinner.recommend.filters';

// 사이드 이동(상세 등) 후 메뉴로 다시 들어와도 조건이 유지되도록 모듈 범위에 마지막 조건을 보관한다.
const saved = { mine: null, explore: null };

const KEYS = ['q', 'category', 'sigungu', 'dong', 'status', 'price_level', 'fav', 'sort'];
const copyFilters = (f) => ({ ...f, categories: [...f.categories], prices: [...f.prices] });

/** 탭과 필터를 해시 쿼리에서 읽는다. 탭 외의 쿼리가 없으면 그 탭의 마지막 조건을 쓴다. */
function readState() {
  const raw = window.location.hash.split('?')[1];
  const qs = new URLSearchParams(raw || '');
  const tab = qs.get('tab') === 'explore' ? 'explore' : 'mine';
  if (!KEYS.some((k) => qs.has(k)) && saved[tab]) return { tab, filters: copyFilters(saved[tab]) };
  const status = qs.get('status') || '';
  const sort = qs.get('sort') || '';
  return {
    tab,
    filters: {
      q: (qs.get('q') || '').slice(0, 100),
      categories: qs.getAll('category').filter((c) => VALID_CATS.has(c)),
      sigungu: qs.get('sigungu') || '',
      dong: qs.get('dong') || '',
      status: VALID_STATUS.has(status) ? status : '',
      prices: qs.getAll('price_level').filter((p) => VALID_PRICES.has(p)),
      fav: qs.get('fav') === '1',
      sort: VALID_SORT.has(sort) ? sort : DEFAULT_SORT,
    },
  };
}

/** 라우터는 hashchange 로 다시 그리므로, 화면 갱신 없이 주소만 바꾸는 replaceState 를 쓴다. 탭에 해당하는 조건만 쓴다. */
function writeFilters(tab, f) {
  saved[tab] = copyFilters(f);
  const qs = new URLSearchParams();
  if (tab === 'explore') qs.set('tab', 'explore');
  if (f.q) qs.set('q', f.q);
  f.categories.forEach((c) => qs.append('category', c));
  if (tab === 'explore') {
    if (f.sigungu) qs.set('sigungu', f.sigungu);
    if (f.dong) qs.set('dong', f.dong);
  } else {
    if (f.status) qs.set('status', f.status);
    f.prices.forEach((p) => qs.append('price_level', p));
    if (f.fav) qs.set('fav', '1');
    if (f.sort !== DEFAULT_SORT) qs.set('sort', f.sort);
  }
  const s = qs.toString();
  history.replaceState(null, '', `#/restaurants${s ? `?${s}` : ''}`);
}

/** 메인 추천 화면이 같은 조건을 쓰도록 localStorage 에 미리 넣어 둔다(days 는 기존 값 유지). */
function applyToRecommend(f) {
  try {
    let days = 7;
    const prev = JSON.parse(localStorage.getItem(RECOMMEND_KEY) || 'null');
    if (prev && Number.isInteger(prev.days) && prev.days >= 0 && prev.days <= 90) days = prev.days;
    localStorage.setItem(RECOMMEND_KEY, JSON.stringify({
      categories: [...f.categories], prices: [...f.prices], status: f.status, days, favoriteOnly: f.fav,
    }));
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

const GLYPH = { KOREAN: '한', CHINESE: '중', JAPANESE: '일', WESTERN: '양', SNACK: '분', ETC: '기' };
const glyph = (category) => h('span', { class: `cat-glyph cat-${category}`, 'aria-hidden': 'true' }, GLYPH[category] || '기');

const placeTitle = (p) => (p.branch_name ? `${p.name} ${p.branch_name}` : p.name);
const fmt = (n) => n.toLocaleString('ko-KR');

export function restaurantListView(outlet, _params, ctx) {
  const { tab, filters } = readState();
  const explore = tab === 'explore';
  let items = [];
  let total = 0;
  let rawLoaded = 0; // 동네 탐색: 서버가 돌려준 항목 수(내 식당 항목 포함) = 다음 offset
  let seq = 0;

  const hasCondition = () => Boolean(filters.q || filters.categories.length || filters.sigungu || filters.dong);
  const hasMineFilter = () => Boolean(filters.q || filters.categories.length || filters.status || filters.prices.length || filters.fav);

  const listBox = h('div', { class: 'list-box', 'aria-live': 'polite' });
  const totalEl = h('p', { class: 'list-total', role: 'status' });

  // --- 필터 컨트롤 ---
  const sigunguSel = h('select');
  const dongSel = h('select', { disabled: true });
  dongSel.append(h('option', { value: '' }, '시군구를 먼저 선택'));
  const qInput = h('input', { type: 'search', id: 'q', value: filters.q, placeholder: explore ? '식당 이름 검색' : '이름·메모 검색', maxlength: 100 });
  const statusSel = selectEl(STATUSES, filters.status, { blank: '전체' });
  const sortSel = selectEl(SORTS, filters.sort);
  const favInput = h('input', { type: 'checkbox', id: 'fav', checked: filters.fav });

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
      // 지역 목록을 못 받아도 검색은 할 수 있게 한다.
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
      await api.createRestaurant({ ...placeToFormValues(p), status: 'WISHLIST' });
      p.already_registered = true;
      showToast(`"${placeTitle(p)}"을(를) 내 식당에 추가했어요.`, 'success');
      renderList();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  function addButton(p) {
    if (p.already_registered) {
      return h('span', { class: 'place-added' }, [icon('check'), '추가됨']);
    }
    const btn = iconButton({ name: 'plus', label: `${placeTitle(p)} 내 식당에 추가`, text: '추가', cls: 'btn place-add' });
    btn.addEventListener('click', () => addPlace(p, btn));
    return btn;
  }

  function mineRow(r) {
    return h('li', { class: 'row item' }, [
      h('div', { class: 'item-lead' }, [
        glyph(r.category),
        h('div', { class: 'item-main' }, [
          h('h2', { class: 'item-name' }, h('a', { href: `#/restaurants/${r.id}` }, r.name)),
          restaurantBadges(r),
          r.location && h('p', { class: 'muted small' }, r.location),
          skipSuggestion(r, (kind) => kind === 'deleted' && load()),
        ]),
      ]),
      favoriteButton(r),
    ]);
  }

  const placeBadges = (p) =>
    h('div', { class: 'badges' }, [badge(categoryLabel(p.category), 'badge-cat', { icon: 'utensils' }), p.industry_small && badge(p.industry_small)]);

  function placeRow(p) {
    return h('li', { class: 'row item list-place' }, [
      h('div', { class: 'item-lead' }, [
        glyph(p.category),
        h('div', { class: 'item-main' }, [
          h('h2', { class: 'item-name' }, placeTitle(p)),
          placeBadges(p),
          h('p', { class: 'muted small' }, p.location || '주소 정보 없음'),
        ]),
      ]),
      addButton(p),
    ]);
  }

  // --- 목록 ---
  function renderEmpty() {
    totalEl.replaceChildren();
    if (explore) {
      listBox.replaceChildren(
        hasCondition()
          ? emptyState('조건에 맞는 동네 식당이 없어요', '검색어나 지역, 카테고리를 바꿔 보세요.')
          : emptyState('지역이나 카테고리를 골라 동네 식당을 찾아보세요', '시군구를 고르거나 식당 이름을 검색할 수 있어요.'),
      );
      return;
    }
    if (hasMineFilter()) {
      listBox.replaceChildren(emptyState('조건에 맞는 식당이 없어요', '검색어나 필터를 바꿔 보세요.'));
      return;
    }
    listBox.replaceChildren(
      emptyState('아직 등록한 식당이 없어요', '직접 추가하거나 동네 식당에서 골라 담아 보세요.',
        h('div', { class: 'actions' }, [
          iconButton({ name: 'plus', label: '직접 추가', text: '직접 추가', href: '#/restaurants/new', cls: 'btn btn-primary' }),
          iconButton({ name: 'compass', label: '동네에서 찾기', text: '동네에서 찾기', href: '#/restaurants?tab=explore' }),
        ])),
    );
  }

  function renderList() {
    if (items.length === 0) return renderEmpty();
    totalEl.replaceChildren(
      icon(explore ? 'compass' : 'utensils'),
      h('span', {}, explore ? `동네 식당 ${fmt(total)}곳` : `내 식당 ${fmt(total)}곳`),
    );
    const nodes = [h('ul', { class: 'cards' }, items.map((it) => (explore ? placeRow(it) : mineRow(it))))];
    if (explore ? rawLoaded < rawTotal : items.length < total) {
      const label = `더 보기 (${fmt(items.length)}/${fmt(total)})`;
      const more = h('button', { type: 'button', class: 'btn' }, [icon('chevron-down'), h('span', {}, label)]);
      more.addEventListener('click', () => { more.disabled = true; load(true); });
      nodes.push(h('div', { class: 'list-more' }, more));
    }
    listBox.replaceChildren(...nodes);
  }

  let rawTotal = 0;
  async function load(append = false) {
    const my = ++seq;
    if (explore && !hasCondition()) {
      items = []; total = 0; rawLoaded = 0; rawTotal = 0;
      listBox.removeAttribute('aria-busy');
      return renderEmpty();
    }
    if (!append) {
      listBox.setAttribute('aria-busy', 'true');
      listBox.replaceChildren(spinner());
    }
    try {
      let fresh;
      if (explore) {
        // /restaurants/search 는 내 식당과 동네 식당이 섞여 오므로 동네 식당(kind=place)만 쓴다.
        const query = {
          q: filters.q || undefined, category: filters.categories,
          sigungu: filters.sigungu || undefined, dong: filters.dong || undefined, limit: LIMIT,
        };
        let res = await api.searchRestaurants({ ...query, offset: append ? rawLoaded : 0 });
        if (my !== seq || !ctx.isCurrent()) return;
        // 응답은 내 식당이 앞에 온다. 첫 페이지에 내 식당이 섞였으면 동네 식당 시작 위치부터 다시 받는다.
        if (!append && res.mine_total > 0 && res.place_total > 0) {
          res = { ...(await api.searchRestaurants({ ...query, offset: res.mine_total })), offsetBase: res.mine_total };
          if (my !== seq || !ctx.isCurrent()) return;
        }
        rawLoaded = (append ? rawLoaded : res.offsetBase ?? 0) + res.items.length;
        rawTotal = res.total;
        total = res.place_total;
        fresh = res.items.filter((it) => it.kind === 'place');
      } else {
        const res = await api.listRestaurants({
          q: filters.q || undefined, category: filters.categories, status: filters.status || undefined,
          price_level: filters.prices, is_favorite: filters.fav ? true : undefined,
          sort: filters.sort, offset: append ? items.length : 0, limit: LIMIT,
        });
        if (my !== seq || !ctx.isCurrent()) return;
        total = res.total;
        fresh = res.items;
      }
      if (append) {
        // 추가로 항목 순서가 바뀐 경우를 대비해 중복은 건너뛴다.
        const key = (it) => (explore ? it.place_no : it.id);
        const seen = new Set(items.map(key));
        items = items.concat(fresh.filter((it) => !seen.has(key(it))));
      } else {
        items = fresh;
      }
      renderList();
    } catch (e) {
      if (my !== seq) return;
      listBox.replaceChildren(errorState(e, () => load(append)));
    } finally {
      if (my === seq) listBox.removeAttribute('aria-busy');
    }
  }

  function refilter() {
    writeFilters(tab, filters);
    load(false);
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

  const searchRow = h('div', { class: 'search-row' }, [
    h('label', { for: 'q', class: 'sr-only' }, '검색어'),
    qInput,
    h('button', { class: 'btn btn-icon', type: 'submit', 'aria-label': '검색', title: '검색' }, icon('search')),
  ]);
  const catChips = chipGroup({ legend: '카테고리', name: 'lcat', options: CATEGORIES, selected: filters.categories, onChange: (v) => { filters.categories = v; refilter(); } });

  let panelBody;
  if (explore) {
    panelBody = [
      searchRow,
      catChips,
      h('div', { class: 'row-fields' }, [
        field({ label: '시군구', control: sigunguSel, icon: 'map-pin' }),
        field({ label: '동', control: dongSel }),
      ]),
    ];
  } else {
    const detail = h('details', { class: 'filter-detail' }, [
      h('summary', {}, [icon('sliders'), '상세 필터 (상태·가격대·정렬)']),
      chipGroup({ legend: '가격대', name: 'lprice', options: PRICES, selected: filters.prices, onChange: (v) => { filters.prices = v; refilter(); } }),
      h('div', { class: 'row-fields' }, [
        field({ label: '상태', control: statusSel, icon: 'bookmark' }),
        field({ label: '정렬', control: sortSel, icon: 'list' }),
      ]),
      h('div', { class: 'check' }, [favInput, h('label', { for: 'fav' }, [icon('star'), '즐겨찾기만'])]),
    ]);
    if (filters.status || filters.prices.length || filters.fav || filters.sort !== DEFAULT_SORT) detail.open = true;
    panelBody = [searchRow, catChips, detail];
  }

  const recLink = iconButton({ name: 'dices', label: '이 조건으로 추천받기', text: '이 조건으로 추천받기', href: '#/' });
  recLink.addEventListener('click', () => applyToRecommend(filters));

  const tabLink = (key, name, text) => h('a', {
    class: 'seg-tab', href: key === 'explore' ? '#/restaurants?tab=explore' : '#/restaurants',
    'aria-current': key === tab ? 'page' : false,
  }, [icon(name), text]);

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, [icon('utensils', { size: '1.1em' }), '식당']),
        iconButton({ name: 'plus', label: '식당 추가', href: '#/restaurants/new', cls: 'btn btn-primary' }),
      ]),
      h('nav', { class: 'seg', 'aria-label': '식당 보기' }, [tabLink('mine', 'utensils', '내 식당'), tabLink('explore', 'compass', '동네 탐색')]),
      h('form', { class: 'panel', role: 'search', onSubmit: (e) => { e.preventDefault(); filters.q = qInput.value.trim(); refilter(); } }, panelBody),
      h('div', { class: 'list-tools' }, [totalEl, !explore && recLink]),
      listBox,
    ]),
  );
  if (explore) loadSigungus();
  else load(false);
  return () => { seq++; };
}
