import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { chipGroup, emptyState, errorState, favoriteButton, field, pager, restaurantBadges, selectEl, spinner } from '../components/ui.js';
import { CATEGORIES, PRICES, SORTS, STATUSES } from '../constants.js';

const LIMIT = 20;
// 상세 화면에서 돌아와도 검색 조건이 유지되도록 모듈 범위에 보관한다.
const state = { q: '', categories: [], prices: [], status: '', fav: false, sort: 'created_desc', offset: 0 };

export function restaurantListView(outlet, _params, ctx) {
  const listBox = h('div', { class: 'list-box', 'aria-live': 'polite' });
  let seq = 0;

  async function load() {
    const my = ++seq;
    listBox.setAttribute('aria-busy', 'true');
    listBox.replaceChildren(spinner());
    try {
      const data = await api.listRestaurants({
        q: state.q.trim() || undefined,
        category: state.categories,
        price_level: state.prices,
        status: state.status || undefined,
        is_favorite: state.fav ? true : undefined,
        sort: state.sort,
        limit: LIMIT,
        offset: state.offset,
      });
      if (my !== seq || !ctx.isCurrent()) return;
      if (data.items.length === 0 && data.total > 0 && state.offset > 0) {
        state.offset = Math.max(0, (Math.ceil(data.total / LIMIT) - 1) * LIMIT);
        return load();
      }
      renderList(data);
    } catch (e) {
      if (my !== seq) return;
      listBox.replaceChildren(errorState(e, load));
    } finally {
      if (my === seq) listBox.removeAttribute('aria-busy');
    }
  }

  function renderList(data) {
    if (data.items.length === 0) {
      const filtered = state.q || state.categories.length || state.prices.length || state.status || state.fav;
      listBox.replaceChildren(
        emptyState(
          filtered ? '조건에 맞는 식당이 없어요' : '아직 등록한 식당이 없어요',
          filtered ? '검색어나 필터를 바꿔 보세요.' : '가고 싶은 식당을 먼저 추가해 보세요.',
          h('a', { class: 'btn btn-primary', href: '#/restaurants/new' }, '+ 식당 추가'),
        ),
      );
      return;
    }
    const ul = h('ul', { class: 'cards' });
    for (const r of data.items) {
      ul.append(
        h('li', { class: 'card item' }, [
          h('div', { class: 'item-main' }, [
            h('h2', { class: 'item-name' }, h('a', { href: `#/restaurants/${r.id}` }, r.name)),
            restaurantBadges(r),
            r.location && h('p', { class: 'muted small' }, r.location),
          ]),
          favoriteButton(r),
        ]),
      );
    }
    listBox.replaceChildren(
      ul,
      pager({ total: data.total, limit: data.limit, offset: data.offset, onPage: (o) => { state.offset = o; load(); window.scrollTo?.(0, 0); } }),
    );
  }

  const refilter = () => { state.offset = 0; load(); };

  const qInput = h('input', { type: 'search', id: 'q', value: state.q, placeholder: '이름·메모 검색', maxlength: 100 });
  const sortSel = selectEl(SORTS, state.sort);
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; refilter(); });
  const statusSel = selectEl(STATUSES, state.status, { blank: '전체' });
  statusSel.addEventListener('change', () => { state.status = statusSel.value; refilter(); });
  const favInput = h('input', { type: 'checkbox', id: 'fav', checked: state.fav });
  favInput.addEventListener('change', () => { state.fav = favInput.checked; refilter(); });

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, '식당'),
        h('a', { class: 'btn btn-primary', href: '#/restaurants/new' }, '+ 식당 추가'),
      ]),
      h('form', { class: 'panel', role: 'search', onSubmit: (e) => { e.preventDefault(); state.q = qInput.value; refilter(); } }, [
        h('div', { class: 'search-row' }, [
          h('label', { for: 'q', class: 'sr-only' }, '검색어'),
          qInput,
          h('button', { class: 'btn', type: 'submit' }, '검색'),
        ]),
        chipGroup({ legend: '카테고리', name: 'lcat', options: CATEGORIES, selected: state.categories, onChange: (v) => { state.categories = v; refilter(); } }),
        chipGroup({ legend: '가격대', name: 'lprice', options: PRICES, selected: state.prices, onChange: (v) => { state.prices = v; refilter(); } }),
        h('div', { class: 'row-fields' }, [
          field({ label: '상태', control: statusSel }),
          field({ label: '정렬', control: sortSel }),
          h('div', { class: 'check' }, [favInput, h('label', { for: 'fav' }, '즐겨찾기만')]),
        ]),
      ]),
      listBox,
    ]),
  );
  load();
}
