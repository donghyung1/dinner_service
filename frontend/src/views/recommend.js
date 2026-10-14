import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, chipGroup, restaurantBadges, spinner } from '../components/ui.js';
import { locationField, locationLabel } from '../components/locationField.js';
import { showToast } from '../components/toast.js';
import { CATEGORIES, PRICES, STATUSES, categoryLabel, placeToFormValues } from '../constants.js';

const STORAGE_KEY = 'dinner.recommend.filters';
const DEFAULTS = { categories: [], prices: [], status: '', days: 7, favoriteOnly: false };
const FATE_KEY = 'dinner.fateMode';
const TOURNAMENT_KEY = 'dinner.tournamentMode';
const FATE_MAX = 3;
const TOURNAMENT_SIZE = 4;
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

function loadFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

const isPlace = (r) => r.source === 'place';
const candKey = (r) => (isPlace(r) ? `p${r.place_no}` : `m${r.id}`);

function toQuery(f, excludeRec, stale, loc) {
  return {
    category: f.categories,
    price_level: f.prices,
    status: f.status || undefined,
    is_favorite: f.favoriteOnly ? true : undefined,
    exclude_recent_days: f.days,
    exclude_id: excludeRec && !isPlace(excludeRec) ? excludeRec.id : undefined,
    exclude_place_no: excludeRec && isPlace(excludeRec) ? excludeRec.place_no : undefined,
    sigungu: loc?.sigungu,
    dong: loc?.dong || undefined,
    stale_wishlist: stale ? true : undefined,
  };
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof window.matchMedia === 'function' && !prefersReducedMotion();

export function recommendView(outlet, _params, ctx) {
  const filters = loadFilters();
  let busy = false;
  let timer = null;
  let fateMode = loadFlag(FATE_KEY);
  let tournamentMode = loadFlag(TOURNAMENT_KEY);
  let fateCount = 1; // 현재 흐름에서 보고 있는 결과 번호 (메모리 전용)
  let stale = false; // 현재 흐름이 [미뤄둔 곳 뽑기]인지
  let lastRes = null;
  const locField = locationField({ isCurrent: ctx.isCurrent, onChange: () => { lastRes = null; resultBox.replaceChildren(); } });

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

  const gapBox = h('div');
  const fateInput = h('input', { type: 'checkbox', id: 'fate-mode', checked: fateMode && !tournamentMode, disabled: tournamentMode });
  fateInput.addEventListener('change', () => {
    fateMode = fateInput.checked;
    saveFlag(FATE_KEY, fateMode);
    fateCount = 1;
    syncFateNote();
    if (lastRes) renderResult(lastRes);
  });
  const tourInput = h('input', { type: 'checkbox', id: 'tour-mode', checked: tournamentMode });
  tourInput.addEventListener('change', () => {
    tournamentMode = tourInput.checked;
    saveFlag(TOURNAMENT_KEY, tournamentMode);
    fateInput.disabled = tournamentMode;
    fateInput.checked = fateMode && !tournamentMode;
    syncFateNote();
  });
  const fateNote = h('p', { class: 'fate-note', hidden: true });
  function syncFateNote() {
    fateNote.hidden = !(fateMode && !tournamentMode);
    fateNote.textContent = `운명 모드: 결과는 최대 ${FATE_MAX}번까지, 마지막은 받아들여야 해요.`;
  }

  function setCategoryOnly(cat) {
    update({ categories: [cat] });
    catGroup.querySelectorAll('input').forEach((i) => { i.checked = i.value === cat; });
  }

  async function loadGap() {
    try {
      const data = await api.categoryGap();
      if (!ctx.isCurrent()) return;
      const g = data?.gap;
      if (!g) {
        gapBox.replaceChildren();
        return;
      }
      const label = categoryLabel(g.category);
      const text = g.days_since == null ? `${label}은(는) 아직 가본 기록이 없어요` : `${label} 안 먹은 지 ${g.days_since}일째`;
      gapBox.replaceChildren(
        h('button', {
          type: 'button',
          class: 'gap-banner',
          onClick: () => { setCategoryOnly(g.category); start(); },
        }, `🍽 ${text} · 눌러서 뽑기`),
      );
    } catch {
      /* 배너는 부가 기능이므로 실패해도 무시한다 */
    }
  }

  function resetFilters() {
    saveFilters({ ...DEFAULTS });
    recommendView(outlet, _params, ctx);
  }

  const drawBtn = h('button', { class: 'btn btn-primary btn-lg' }, '추천받기');
  drawBtn.type = 'submit';
  const staleBtn = h('button', { type: 'button', class: 'btn', onClick: () => start({ stale: true }) }, '미뤄둔 곳 뽑기');

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

  /** 새 흐름 시작: 카운터를 1로 돌리고 모드에 맞게 뽑는다. */
  function start({ stale: st = false } = {}) {
    if (busy) return;
    stale = st;
    fateCount = 1;
    lastRes = null;
    return tournamentMode ? drawCandidates() : draw();
  }

  function guardDays() {
    if (daysInput.getAttribute('aria-invalid')) {
      daysInput.focus();
      return false;
    }
    return true;
  }

  async function run(fetcher, onOk) {
    busy = true;
    drawBtn.disabled = true;
    staleBtn.disabled = true;
    resultBox.setAttribute('aria-busy', 'true');
    showResult(spinner('맛집을 고르는 중…'));
    try {
      const [res] = await Promise.all([fetcher().then((v) => ({ ok: v }), (e) => ({ err: e })), animate()]);
      if (!ctx.isCurrent()) return;
      if (res.err) throw res.err;
      onOk(res.ok);
    } catch (e) {
      lastRes = null;
      if (e.code === 'NO_CANDIDATES') renderNoCandidates();
      else showResult(h('div', { class: 'state state-error', role: 'alert' }, [
        h('p', { class: 'state-title' }, '추천을 불러오지 못했어요'),
        h('p', { class: 'muted' }, e.message),
      ]));
    } finally {
      busy = false;
      drawBtn.disabled = false;
      staleBtn.disabled = false;
      resultBox.removeAttribute('aria-busy');
    }
  }

  function draw(excludeRec) {
    if (busy || !guardDays()) return;
    return run(() => api.recommend(toQuery(filters, excludeRec, stale, locField.get())), (res) => {
      lastRes = res;
      renderResult(res);
    });
  }

  function drawCandidates() {
    if (busy || !guardDays()) return;
    return run(
      () => api.recommendCandidates({ ...toQuery(filters, undefined, stale, locField.get()), count: TOURNAMENT_SIZE }),
      (res) => {
        renderTournament(res.restaurants || []);
      },
    );
  }

  /** 다시 뽑기: 직전 식당을 넘김으로 기록(실패 무시)하고 같은 조건으로 다시 뽑는다. */
  function again(r) {
    if (busy) return;
    if (!isPlace(r)) api.createSkip(r.id).catch(() => {}); // 넘김 기록은 내 식당에만 남긴다
    fateCount += 1;
    return draw(r);
  }

  async function accept(r, btn, statusEl) {
    btn.disabled = true;
    try {
      // 동네 식당은 먼저 내 식당(가보고 싶음)으로 추가한 뒤 방문을 기록한다.
      const id = isPlace(r) ? (await api.createRestaurant({ ...placeToFormValues(r), status: 'WISHLIST' })).id : r.id;
      await api.createVisit({ restaurant_id: id, source: 'RECOMMENDATION' });
      showToast(`${r.name} 방문을 기록했어요. 맛있게 드세요!`, 'success');
      statusEl.replaceChildren(
        h('p', { class: 'accepted' }, ['✔ 오늘 방문으로 기록했어요. ', h('a', { href: '#/visits' }, '기록 보기')]),
      );
      btn.hidden = true;
      loadGap();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  const placeBadges = (r) =>
    h('div', { class: 'badges' }, [badge(categoryLabel(r.category), 'badge-cat'), badge('동네 식당(공공데이터)')]);
  const badgesOf = (r) => (isPlace(r) ? placeBadges(r) : restaurantBadges(r));

  /** 동네 식당 [내 식당에 추가]. 추가 후 버튼은 안내 문구로 바뀐다. */
  function addPlaceButton(r) {
    const btn = h('button', { type: 'button', class: 'btn' }, '내 식당에 추가');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.createRestaurant({ ...placeToFormValues(r), status: 'WISHLIST' });
        showToast(`"${r.name}"을(를) 내 식당에 추가했어요.`, 'success');
        btn.textContent = '추가했어요 ✔';
      } catch (e) {
        btn.disabled = false;
        showToast(e.message, 'error');
      }
    });
    return btn;
  }

  function factsOf(r) {
    if (isPlace(r)) return h('dl', { class: 'facts' }, [h('dt', {}, '주소'), h('dd', {}, r.location || '주소 정보 없음')]);
    return h('dl', { class: 'facts' }, [
      r.location && [h('dt', {}, '위치'), h('dd', {}, r.location)],
      r.memo && [h('dt', {}, '메모'), h('dd', { class: 'pre' }, r.memo)],
      h('dt', {}, '마지막 방문'),
      h('dd', {}, r.last_visited_on || '아직 방문 기록이 없어요'),
    ]);
  }

  function resultCard(r, eyebrow, buttons, status) {
    return h('article', { class: 'card result-card reveal' }, [
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h2', { class: 'result-name' }, [r.name, r.is_favorite && h('span', { class: 'star', title: '즐겨찾기' }, ' ★')]),
      badgesOf(r),
      factsOf(r),
      status,
      h('div', { class: 'actions' }, [
        ...buttons,
        isPlace(r) ? addPlaceButton(r) : h('a', { class: 'btn btn-ghost', href: `#/restaurants/${r.id}` }, '상세 보기'),
      ]),
    ]);
  }

  function renderResult(res) {
    const { restaurant: r, candidate_count } = res;
    const fate = fateMode && !tournamentMode;
    const last = fate && fateCount >= FATE_MAX;
    const status = h('div');
    const acceptBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '여기로 갈래요');
    acceptBtn.addEventListener('click', () => accept(r, acceptBtn, status));
    const againBtn = h('button', { type: 'button', class: 'btn', disabled: last, onClick: () => again(r) }, '다시 뽑기');
    const head = stale ? '미뤄둔 곳' : '오늘의 추천';
    const eyebrow = `${head} · 후보 ${candidate_count}곳 중${fate ? ` · 운명 ${Math.min(fateCount, FATE_MAX)}/${FATE_MAX}` : ''}`;
    const card = resultCard(r, eyebrow, [acceptBtn, againBtn], status);
    if (last) card.insertBefore(h('p', { class: 'fate-note' }, '운명입니다'), status);
    showResult(card);
    (acceptBtn.focus && !acceptBtn.disabled) && acceptBtn.focus({ preventScroll: true });
  }

  function renderFinal(r, total) {
    const status = h('div');
    const acceptBtn = h('button', { type: 'button', class: 'btn btn-primary' }, '여기로 갈래요');
    acceptBtn.addEventListener('click', () => accept(r, acceptBtn, status));
    const restart = h('button', { type: 'button', class: 'btn', onClick: () => start({ stale }) }, '처음부터 다시');
    showResult(resultCard(r, total > 1 ? '최후의 1곳' : '토너먼트 · 후보가 1곳뿐이에요', [acceptBtn, restart], status));
    acceptBtn.focus?.({ preventScroll: true });
  }

  function renderTournament(list) {
    if (list.length <= 1) {
      if (list[0]) renderFinal(list[0], list.length);
      else renderNoCandidates();
      return;
    }
    const total = list.length;
    let left = [...list];
    const grid = h('div', { class: 'tournament' });
    const head = h('p', { class: 'tournament-head', 'aria-live': 'polite' });
    const paint = () => {
      head.textContent = `마음에 안 드는 곳을 지워 주세요 (${left.length}곳 남음)`;
    };
    for (const r of left) {
      const card = h('article', { class: 'card reveal' });
      const del = h('button', { type: 'button', class: 'btn btn-danger-ghost', 'aria-label': `${r.name} 지우기` }, '지우기');
      del.addEventListener('click', () => {
        left = left.filter((x) => candKey(x) !== candKey(r));
        card.remove();
        if (left.length === 1) renderFinal(left[0], total);
        else {
          paint();
          grid.querySelector('button')?.focus();
        }
      });
      card.append(
        h('h2', { class: 'item-name' }, [r.name, r.is_favorite && h('span', { class: 'star', title: '즐겨찾기' }, ' ★')]),
        badgesOf(r),
        factsOf(r),
        h('div', { class: 'actions' }, [del, isPlace(r) && addPlaceButton(r)]),
      );
      grid.append(card);
    }
    paint();
    showResult(h('div', {}, [head, grid]));
  }

  function renderNoCandidates() {
    const loc = locField.get();
    const relax = h('button', {
      type: 'button',
      class: 'btn',
      onClick: () => {
        update({ days: 0 });
        daysInput.value = 0;
        daysErr.textContent = '';
        daysInput.removeAttribute('aria-invalid');
        start({ stale });
      },
    }, '최근 방문 제외 없이 다시 뽑기');
    const reset = h('button', { type: 'button', class: 'btn', onClick: resetFilters }, '조건 모두 초기화');
    if (stale) {
      showResult(
        h('div', { class: 'state state-empty', role: 'status' }, [
          h('p', { class: 'state-title' }, '미뤄둔 곳이 없어요. 잘하고 계세요!'),
          h('p', { class: 'muted' }, '등록 후 30일 넘게 안 간 가보고 싶음 식당이 없어요.'),
        ]),
      );
      return;
    }
    showResult(
      h('div', { class: 'state state-empty', role: 'status' }, [
        h('p', { class: 'state-title' }, loc ? `${locationLabel(loc)}에 조건에 맞는 식당이 없어요` : '조건에 맞는 식당이 없어요'),
        h('ul', { class: 'tips' }, [
          h('li', {}, '카테고리나 가격대 선택을 줄여 보세요.'),
          h('li', {}, '최근 방문 제외 일수를 줄이거나 0으로 바꿔 보세요.'),
          loc && h('li', {}, '위치를 넓히거나(동 전체·다른 동) 해제해 보세요.'),
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
        gapBox,
        h('form', { class: 'panel', onSubmit: (e) => { e.preventDefault(); start(); } }, [
          locField.el,
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
          h('div', { class: 'modes' }, [
            h('div', { class: 'check' }, [fateInput, h('label', { for: 'fate-mode' }, '운명 모드 (결과 최대 3번)')]),
            h('div', { class: 'check' }, [tourInput, h('label', { for: 'tour-mode' }, '토너먼트 모드 (4곳 중 하나씩 지우기)')]),
          ]),
          fateNote,
          h('div', { class: 'actions' }, [drawBtn, staleBtn]),
        ]),
        resultBox,
      ]),
    );
  }

  renderAll();
  syncFateNote();
  loadGap();
  return () => timer && clearInterval(timer);
}
