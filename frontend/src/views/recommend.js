import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { chipGroup, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { CATEGORIES, PRICES, STATUSES, categoryLabel, priceLabel, statusLabel } from '../constants.js';

const STORAGE_KEY = 'dinner.recommend.filters';
const DEFAULTS = { categories: [], prices: [], status: '', days: 7, favoriteOnly: false };
const SLOT_FACES = ['🍜', '🍣', '🍕', '🍚', '🥟', '🍔', '🥘', '🍛', '🥗', '🍢'];

function loadFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    const days = Number.isInteger(raw.days) && raw.days >= 0 && raw.days <= 90 ? raw.days : DEFAULTS.days;
    return {
      categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
      prices: Array.isArray(raw.prices) ? raw.prices.map(String) : [],
      status: ['REGULAR', 'WISHLIST'].includes(raw.status) ? raw.status : '',
      days,
      favoriteOnly: raw.favoriteOnly === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveFilters(f) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

function toQuery(f, excludeId) {
  return {
    category: f.categories,
    price_level: f.prices,
    status: f.status || undefined,
    is_favorite: f.favoriteOnly ? true : undefined,
    exclude_recent_days: f.days,
    exclude_id: excludeId,
  };
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof window.matchMedia === 'function' && !prefersReducedMotion();

export function recommendView(outlet, _params, ctx) {
  const filters = loadFilters();
  let current = null; // 현재 추천 결과
  let busy = false;
  let timer = null;

  const resultBox = h('div', { class: 'result', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const catGroup = chipGroup({
    legend: '카테고리',
    name: 'cat',
    options: CATEGORIES,
    selected: filters.categories,
    onChange: (v) => update({ categories: v }),
  });
  const priceGroup = chipGroup({
    legend: '가격대',
    name: 'price',
    options: PRICES,
    selected: filters.prices,
    onChange: (v) => update({ prices: v }),
  });
  const statusGroup = chipGroup({
    legend: '상태',
    name: 'status',
    type: 'radio',
    options: [['', '전체'], ...STATUSES],
    selected: [filters.status],
    onChange: (v) => update({ status: v[0] ?? '' }),
  });
  const daysInput = h('input', {
    type: 'number',
    id: 'days',
    min: 0,
    max: 90,
    step: 1,
    value: filters.days,
    inputmode: 'numeric',
  });
  const daysErr = h('p', { class: 'field-error', id: 'days-err', role: 'alert' });
  daysInput.setAttribute('aria-describedby', 'days-err days-hint');
  daysInput.addEventListener('input', () => {
    const n = Number(daysInput.value);
    if (daysInput.value === '' || !Number.isInteger(n) || n < 0 || n > 90) {
      daysErr.textContent = '0~90 사이의 정수를 입력해 주세요.';
      daysInput.setAttribute('aria-invalid', 'true');
    } else {
      daysErr.textContent = '';
      daysInput.removeAttribute('aria-invalid');
      update({ days: n });
    }
  });
  const favInput = h('input', { type: 'checkbox', id: 'fav-only', checked: filters.favoriteOnly });
  favInput.addEventListener('change', () => update({ favoriteOnly: favInput.checked }));

  function update(patch) {
    Object.assign(filters, patch);
    saveFilters(filters);
  }

  function resetFilters() {
    saveFilters({ ...DEFAULTS });
    recommendView(outlet, _params, ctx);
  }

  const drawBtn = h('button', { class: 'btn btn-primary btn-lg', onClick: () => draw() }, '추천받기');
  drawBtn.type = 'submit';

  function showResult(node) {
    resultBox.replaceChildren(node);
  }

  async function animate() {
    if (!canAnimate()) return;
    const face = h('div', { class: 'slot', 'aria-hidden': 'true' });
    showResult(face);
    let i = 0;
    timer = setInterval(() => {
      face.textContent = SLOT_FACES[i++ % SLOT_FACES.length];
    }, 90);
    await new Promise((r) => setTimeout(r, 1000));
    clearInterval(timer);
    timer = null;
  }

  async function draw(excludeId) {
    if (busy) return;
    if (daysInput.getAttribute('aria-invalid')) {
      daysInput.focus();
      return;
    }
    busy = true;
    drawBtn.disabled = true;
    resultBox.setAttribute('aria-busy', 'true');
    showResult(spinner('맛집을 고르는 중…'));
    try {
      const [res] = await Promise.all([
        api.recommend(toQuery(filters, excludeId)).then(
          (v) => ({ ok: v }),
          (e) => ({ err: e }),
        ),
        animate(),
      ]);
      if (!ctx.isCurrent()) return;
      if (res.err) throw res.err;
      current = res.ok.restaurant;
      renderResult(res.ok);
    } catch (e) {
      current = null;
      if (e.code === 'NO_CANDIDATES') renderNoCandidates();
      else showResult(h('div', { class: 'state state-error', role: 'alert' }, [
        h('p', { class: 'state-title' }, '추천을 불러오지 못했어요'),
        h('p', { class: 'muted' }, e.message),
      ]));
    } finally {
      busy = false;
      drawBtn.disabled = false;
      resultBox.removeAttribute('aria-busy');
    }
  }

  async function accept(btn, statusEl) {
    btn.disabled = true;
    try {
      await api.createVisit({ restaurant_id: current.id, source: 'RECOMMENDATION' });
      showToast(`${current.name} 방문을 기록했어요. 맛있게 드세요!`, 'success');
      statusEl.replaceChildren(
        h('p', { class: 'accepted' }, ['✔ 오늘 방문으로 기록했어요. ', h('a', { href: '#/visits' }, '기록 보기')]),
      );
      btn.hidden = true;
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  function renderResult({ restaurant: r, candidate_count }) {
    const status = h('div');
    const acceptBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '여기로 갈래요');
    acceptBtn.addEventListener('click', () => accept(acceptBtn, status));
    const again = h('button', { type: 'button', class: 'btn', onClick: () => draw(r.id) }, '다시 뽑기');
    const card = h('article', { class: 'card result-card reveal' }, [
      h('p', { class: 'eyebrow' }, `오늘의 추천 · 후보 ${candidate_count}곳 중`),
      h('h2', { class: 'result-name' }, [r.name, r.is_favorite && h('span', { class: 'star', title: '즐겨찾기' }, ' ★')]),
      h('div', { class: 'badges' }, [
        h('span', { class: 'badge badge-cat' }, categoryLabel(r.category)),
        r.price_level != null && h('span', { class: 'badge' }, priceLabel(r.price_level)),
        h('span', { class: `badge ${r.status === 'REGULAR' ? 'badge-regular' : 'badge-wish'}` }, statusLabel(r.status)),
      ]),
      h('dl', { class: 'facts' }, [
        r.location && [h('dt', {}, '위치'), h('dd', {}, r.location)],
        r.memo && [h('dt', {}, '메모'), h('dd', { class: 'pre' }, r.memo)],
        h('dt', {}, '마지막 방문'),
        h('dd', {}, r.last_visited_on || '아직 방문 기록이 없어요'),
      ]),
      status,
      h('div', { class: 'actions' }, [acceptBtn, again, h('a', { class: 'btn btn-ghost', href: `#/restaurants/${r.id}` }, '상세 보기')]),
    ]);
    showResult(card);
    (acceptBtn.focus && !acceptBtn.disabled) && acceptBtn.focus({ preventScroll: true });
  }

  function renderNoCandidates() {
    const relax = h('button', {
      type: 'button',
      class: 'btn',
      onClick: () => {
        update({ days: 0 });
        daysInput.value = 0;
        daysErr.textContent = '';
        daysInput.removeAttribute('aria-invalid');
        draw();
      },
    }, '최근 방문 제외 없이 다시 뽑기');
    const reset = h('button', { type: 'button', class: 'btn', onClick: resetFilters }, '조건 모두 초기화');
    showResult(
      h('div', { class: 'state state-empty', role: 'status' }, [
        h('p', { class: 'state-title' }, '조건에 맞는 식당이 없어요'),
        h('ul', { class: 'tips' }, [
          h('li', {}, '카테고리나 가격대 선택을 줄여 보세요.'),
          h('li', {}, '최근 방문 제외 일수를 줄이거나 0으로 바꿔 보세요.'),
          h('li', {}, '새로운 식당을 추가해 보세요.'),
        ]),
        h('div', { class: 'actions' }, [relax, reset, h('a', { class: 'btn btn-primary', href: '#/restaurants/new' }, '식당 추가')]),
      ]),
    );
  }

  function renderAll() {
    outlet.replaceChildren(
      h('section', { class: 'page' }, [
        h('h1', {}, '오늘 뭐 먹지?'),
        h('p', { class: 'lead' }, '조건을 고르고 버튼을 누르면 한 곳을 골라 드려요.'),
        h('form', { class: 'panel', onSubmit: (e) => { e.preventDefault(); draw(); } }, [
          catGroup,
          priceGroup,
          statusGroup,
          h('div', { class: 'row-fields' }, [
            h('div', { class: 'field' }, [
              h('label', { for: 'days' }, '최근 방문 제외 (일)'),
              daysInput,
              h('p', { class: 'hint', id: 'days-hint' }, '0이면 제외하지 않아요. 최대 90일.'),
              daysErr,
            ]),
            h('div', { class: 'check' }, [favInput, h('label', { for: 'fav-only' }, '즐겨찾기만')]),
          ]),
          h('div', { class: 'actions' }, [
            drawBtn,
          ]),
        ]),
        resultBox,
      ]),
    );
  }

  renderAll();
  return () => timer && clearInterval(timer);
}
