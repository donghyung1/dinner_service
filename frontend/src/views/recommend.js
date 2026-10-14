import '../styles/recommend.css';
import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, chipGroup, restaurantBadges, spinner } from '../components/ui.js';
import { icon, iconButton, iconLabel } from '../components/icon.js';
import { locationField, locationLabel } from '../components/locationField.js';
import { showToast } from '../components/toast.js';
import { relativeDate } from '../components/date.js';
import { CATEGORIES, PRICES, STATUSES, categoryLabel, priceLabel, statusLabel, placeToFormValues } from '../constants.js';

const STORAGE_KEY = 'dinner.recommend.filters';
const DEFAULTS = { categories: [], prices: [], status: '', days: 7, favoriteOnly: false };
const FATE_KEY = 'dinner.fateMode';
const TOURNAMENT_KEY = 'dinner.tournamentMode';
const FATE_MAX = 3;
const TOURNAMENT_SIZE = 4;
const DRAWS_KEY = 'dinner.draws';
// 최근 방문 제외 일수 선택지(0 = 제외 안 함)
const DAYS_OPTIONS = [0, 3, 7, 14, 30];
const nearestDays = (n) => DAYS_OPTIONS.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), DAYS_OPTIONS[0]);
const MODES = [
  ['basic', '기본', '한 곳을 골라 드려요'],
  ['fate', '운명', `결과는 최대 ${FATE_MAX}번, 마지막은 받아들여야 해요`],
  ['tournament', '토너먼트', `${TOURNAMENT_SIZE}곳 중 하나씩 지워 최후의 1곳을 골라요`],
];
// 더블탭 인식 간격(ms)·허용 이동(px), 왼쪽 스와이프 기준(px)
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 24;
const SWIPE_MIN = 80;

/** 오늘 뽑은 횟수(식권 번호). {date, count} 를 localStorage 에 두고 날짜가 바뀌면 1부터 다시 센다. */
function bumpDrawCount() {
  const today = new Date().toLocaleDateString('sv-SE');
  let count = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(DRAWS_KEY) || 'null');
    if (raw && raw.date === today && Number.isInteger(raw.count)) count = raw.count;
    count += 1;
    localStorage.setItem(DRAWS_KEY, JSON.stringify({ date: today, count }));
  } catch {
    count = count || 1;
  }
  return count;
}

function loadFilters() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
    const days = Number.isInteger(raw.days) && raw.days >= 0 && raw.days <= 90 ? nearestDays(raw.days) : DEFAULTS.days;
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
  let drawNo = 1; // 현재 식권 번호(오늘 N번째 뽑기)
  let tournamentMode = loadFlag(TOURNAMENT_KEY);
  let fateMode = loadFlag(FATE_KEY) && !tournamentMode; // 토너먼트 플래그가 우선
  let quick = false; // 같은 흐름의 두 번째 이후 뽑기(짧은 연출)
  let fateCount = 1; // 현재 흐름에서 보고 있는 결과 번호 (메모리 전용)
  let stale = false; // 현재 흐름이 [미뤄둔 곳 뽑기]인지
  let lastRes = null;
  const locField = locationField({ isCurrent: ctx.isCurrent, onChange: () => { lastRes = null; resultBox.replaceChildren(); renderSummary(); } });

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
  const daysGroup = chipGroup({
    legend: '최근 방문 제외',
    name: 'days',
    type: 'radio',
    options: DAYS_OPTIONS.map((d) => [d, d === 0 ? '제외 안 함' : `${d}일`]),
    selected: [filters.days],
    onChange: (v) => update({ days: Number(v[0] ?? 0) }),
  });
  const favInput = h('input', { type: 'checkbox', id: 'fav-only', checked: filters.favoriteOnly });
  favInput.addEventListener('change', () => update({ favoriteOnly: favInput.checked }));

  function update(patch) {
    Object.assign(filters, patch);
    saveFilters(filters);
    renderSummary();
  }

  const gapBox = h('div');

  // 모드: 기본 · 운명 · 토너먼트 (라디오 세그먼트). 저장은 기존 두 플래그를 그대로 쓴다.
  const currentMode = () => (tournamentMode ? 'tournament' : fateMode ? 'fate' : 'basic');
  const modeNote = h('p', { class: 'mode-note', id: 'mode-note' });
  const modeGroup = h('fieldset', { class: 'mode-seg', 'aria-describedby': 'mode-note' }, [
    h('legend', {}, [icon('sparkles'), '모드']),
    h('div', { class: 'mode-seg-row' }, MODES.map(([value, label]) => {
      const id = `mode-${value}`;
      const input = h('input', { type: 'radio', name: 'mode', id, value, checked: currentMode() === value });
      input.addEventListener('change', () => setMode(value));
      return h('span', { class: 'mode-seg-item' }, [input, h('label', { for: id }, label)]);
    })),
    modeNote,
  ]);
  function syncModeNote() {
    modeNote.textContent = MODES.find(([v]) => v === currentMode())[2];
  }
  function setMode(mode) {
    tournamentMode = mode === 'tournament';
    fateMode = mode === 'fate';
    saveFlag(TOURNAMENT_KEY, tournamentMode);
    saveFlag(FATE_KEY, fateMode);
    fateCount = 1;
    syncModeNote();
    if (lastRes && !tournamentMode) renderResult(lastRes);
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
        }, [icon('utensils'), h('span', {}, text), icon('dices', { cls: 'gap-go' })]),
      );
    } catch {
      /* 배너는 부가 기능이므로 실패해도 무시한다 */
    }
  }

  function resetFilters() {
    saveFilters({ ...DEFAULTS });
    recommendView(outlet, _params, ctx);
  }

  const drawBtn = h('button', { class: 'btn btn-primary btn-lg btn-draw', type: 'submit' }, [icon('dices', { size: '1.2em' }), h('span', {}, '추천받기')]);
  const staleBtn = iconButton({ name: 'hourglass', label: '미뤄둔 곳 뽑기', text: '미뤄둔 곳 뽑기', cls: 'btn btn-ghost', onClick: () => start({ stale: true }) });

  function showResult(node) {
    resultBox.replaceChildren(node);
    revealResult();
  }

  /** 결과 영역이 화면 아래쪽에 가려져 있으면 보이도록 스크롤한다(모바일에서 식권이 접힌 아래로 나오는 문제). */
  function revealResult() {
    const top = resultBox.getBoundingClientRect?.().top;
    if (top == null || top < window.innerHeight * 0.45) return;
    resultBox.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  /** 식권 발급구: 발급구 선 아래로 빈 식권이 밀려 나오는 대기 연출. 움직임 줄이기 설정이면 건너뛴다. */
  async function animate() {
    if (!canAnimate()) return;
    showResult(
      h('div', { class: `printer${quick ? ' is-quick' : ''}`, 'aria-hidden': 'true' }, [
        h('div', { class: 'slot-line' }),
        h('div', { class: 'printer-window' }, h('div', { class: 'ticket ticket-blank' }, [h('span'), h('span'), h('span')])),
      ]),
    );
    await new Promise((r) => setTimeout(r, quick ? 350 : 900));
  }

  /** 새 흐름 시작: 카운터를 1로 돌리고 모드에 맞게 뽑는다. */
  function start({ stale: st = false } = {}) {
    if (busy) return;
    stale = st;
    quick = false;
    fateCount = 1;
    lastRes = null;
    return tournamentMode ? drawCandidates() : draw();
  }

  async function run(fetcher, onOk) {
    busy = true;
    drawBtn.disabled = true;
    staleBtn.disabled = true;
    resultBox.setAttribute('aria-busy', 'true');
    showResult(spinner('식권을 뽑는 중…'));
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
    if (busy) return;
    return run(() => api.recommend(toQuery(filters, excludeRec, stale, locField.get())), (res) => {
      drawNo = bumpDrawCount();
      lastRes = res;
      renderResult(res);
    });
  }

  function drawCandidates() {
    if (busy) return;
    return run(
      () => api.recommendCandidates({ ...toQuery(filters, undefined, stale, locField.get()), count: TOURNAMENT_SIZE }),
      (res) => {
        drawNo = bumpDrawCount();
        renderTournament(res.restaurants || []);
      },
    );
  }

  /** 다시 뽑기: 직전 식당을 넘김으로 기록(실패 무시)하고 같은 조건으로 다시 뽑는다. */
  function again(r) {
    if (busy) return;
    if (!isPlace(r)) api.createSkip(r.id).catch(() => {}); // 넘김 기록은 내 식당에만 남긴다
    fateCount += 1;
    quick = true;
    return draw(r);
  }

  async function accept(r, btn, statusEl, ticketEl, hintEl) {
    btn.disabled = true;
    try {
      // 동네 식당은 먼저 내 식당(가보고 싶음)으로 추가한 뒤 방문을 기록한다.
      const id = isPlace(r) ? (await api.createRestaurant({ ...placeToFormValues(r), status: 'WISHLIST' })).id : r.id;
      await api.createVisit({ restaurant_id: id, source: 'RECOMMENDATION' });
      showToast(`${r.name} 방문을 기록했어요. 맛있게 드세요!`, 'success');
      statusEl.replaceChildren(
        h('p', { class: 'accepted' }, [
          icon('circle-check'),
          h('span', {}, '오늘 방문으로 기록했어요.'),
          iconButton({ name: 'notebook-pen', label: '기록 보기', text: '기록 보기', href: '#/visits', cls: 'btn btn-ghost btn-sm' }),
        ]),
      );
      btn.hidden = true;
      if (hintEl) hintEl.hidden = true;
      stampTicket(ticketEl);
      loadGap();
    } catch (e) {
      btn.disabled = false;
      showToast(e.message, 'error');
    }
  }

  const placeBadges = (r) =>
    h('div', { class: 'badges' }, [
      badge(categoryLabel(r.category), 'badge-cat', { icon: 'utensils' }),
      badge('동네 식당(공공데이터)', '', { icon: 'landmark', iconOnly: true }),
    ]);

  /** 수락된 식권에 붉은 도장을 찍는다. */
  function stampTicket(ticketEl) {
    if (!ticketEl || ticketEl.querySelector('.seal')) return;
    ticketEl.classList.add('is-stamped');
    ticketEl.append(
      h('div', { class: `seal${canAnimate() ? ' stamp-in' : ''}`, role: 'img', 'aria-label': '오늘은 여기' }, [
        h('span', {}, '오늘은'),
        h('span', {}, '여기'),
      ]),
    );
  }
  const badgesOf = (r) => (isPlace(r) ? placeBadges(r) : restaurantBadges(r));

  /** 동네 식당 [내 식당에 추가]. 추가 후 버튼은 안내 문구로 바뀐다. */
  function addPlaceButton(r) {
    const btn = iconButton({ name: 'plus', label: '내 식당에 추가', text: '내 식당에 추가' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.createRestaurant({ ...placeToFormValues(r), status: 'WISHLIST' });
        showToast(`"${r.name}"을(를) 내 식당에 추가했어요.`, 'success');
        btn.replaceChildren(icon('check'), h('span', {}, '추가했어요'));
        btn.setAttribute('aria-label', '내 식당에 추가했어요');
        btn.title = '내 식당에 추가했어요';
      } catch (e) {
        btn.disabled = false;
        showToast(e.message, 'error');
      }
    });
    return btn;
  }

  function factsOf(r) {
    const row = (name, label, value, cls = '') => [
      h('dt', {}, iconLabel(name, label)),
      h('dd', cls ? { class: cls } : {}, value),
    ];
    if (isPlace(r)) return h('dl', { class: 'facts' }, row('map-pin', '주소', r.location || '주소 정보 없음'));
    return h('dl', { class: 'facts' }, [
      r.location && row('map-pin', '위치', r.location),
      r.memo && row('note', '메모', r.memo, 'pre'),
      row('calendar', '마지막 방문', r.last_visited_on ? relativeDate(r.last_visited_on) : '아직 방문 기록이 없어요'),
    ]);
  }

  // 내 식당은 이름 자체가 상세 링크, 동네 식당은 [내 식당에 추가] 버튼을 둔다.
  const detailLink = (r) => (isPlace(r) ? addPlaceButton(r) : null);

  /** 식권 한 장. stub 이 있으면 본체 | 절취선 | 스텁 구조, small 이면 스텁 없는 작은 식권. */
  function ticket(r, { stub, buttons = [], status, small = false, note }) {
    const main = h('div', { class: 'ticket-main' }, [
      badgesOf(r),
      h('h2', { class: 'ticket-name' }, [
        !small && !isPlace(r) ? h('a', { class: 'ticket-link', href: `#/restaurants/${r.id}`, title: '상세 보기' }, r.name) : r.name,
        r.is_favorite && h('span', { class: 'star-mark', title: '즐겨찾기' }, [icon('star', { cls: 'is-fav' }), h('span', { class: 'sr-only' }, '즐겨찾기')]),
      ]),
      factsOf(r),
      note,
      status,
      h('div', { class: 'actions' }, buttons),
    ]);
    if (small) return h('article', { class: 'ticket ticket-sm reveal' }, main);
    return h('article', { class: `ticket${quick ? ' is-quick' : ''}` }, [main, h('div', { class: 'ticket-perf', 'aria-hidden': 'true' }), stub]);
  }

  function ticketStub(res, fate) {
    return h('div', { class: 'ticket-stub' }, [
      h('p', { class: 'stub-no', title: `오늘 ${drawNo}번째 뽑기` }, [
        h('span', { 'aria-hidden': 'true' }, 'No.'),
        h('strong', {}, String(drawNo).padStart(2, '0')),
        h('span', { class: 'sr-only' }, `오늘 ${drawNo}번째 뽑기`),
      ]),
      h('ul', { class: 'stub-meta' }, [
        res && h('li', {}, [iconLabel('list-checks', `후보 ${res.candidate_count}곳 중`), h('span', {}, String(res.candidate_count))]),
        stale && h('li', {}, [iconLabel('hourglass', '미뤄둔 곳')]),
        fate && h('li', {}, [iconLabel('sparkles', `운명 ${Math.min(fateCount, FATE_MAX)}/${FATE_MAX}`), h('span', {}, `${Math.min(fateCount, FATE_MAX)}/${FATE_MAX}`)]),
      ]),
    ]);
  }

  function printed(node) {
    return h('div', { class: 'printer' }, [h('div', { class: 'slot-line' }), h('div', { class: 'printer-window' }, node)]);
  }

  /**
   * 전체 식권 제스처: 더블탭(터치)·더블클릭(마우스)이면 수락, 왼쪽 스와이프면 다시 뽑기.
   * 버튼·링크 위의 입력은 무시하고, 이미 수락했거나 처리 중이면 아무것도 하지 않는다.
   */
  function bindGestures(t, acceptBtn, againBtn) {
    let firedAt = 0;
    let lastTap = null; // {t, x, y}
    let down = null; // {x, y, id}
    const onControl = (e) => e.target.closest?.('a, button');
    const tryAccept = () => {
      const now = Date.now();
      if (now - firedAt < 600) return; // dblclick 과 pointerup 더블탭의 이중 발동 방지
      if (busy || acceptBtn.disabled || acceptBtn.hidden) return;
      firedAt = now;
      window.getSelection?.()?.removeAllRanges();
      acceptBtn.click();
    };
    t.addEventListener('dblclick', (e) => { if (!onControl(e)) tryAccept(); });
    t.addEventListener('pointerdown', (e) => {
      down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    t.addEventListener('pointercancel', () => { down = null; lastTap = null; });
    t.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (onControl(e)) return;
      // 왼쪽 스와이프: 다시 뽑기
      if (dx < -SWIPE_MIN && Math.abs(dy) < Math.abs(dx) * 0.5) {
        lastTap = null;
        if (!busy && !againBtn.disabled && !againBtn.hidden) againBtn.click();
        return;
      }
      if (Math.hypot(dx, dy) > TAP_SLOP) { lastTap = null; return; }
      // 터치 더블탭: 300ms 안에 가까운 위치를 두 번 탭
      const now = Date.now();
      if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_SLOP * 2) {
        lastTap = null;
        tryAccept();
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    });
  }

  const acceptHint = () => h('p', { class: 'ticket-hint' }, '식권을 두 번 탭해도 도장이 찍혀요');

  function acceptButton() {
    return iconButton({ name: 'check', label: '여기로 갈래요', text: '여기로 갈래요', cls: 'btn btn-primary btn-accept' });
  }

  function renderResult(res) {
    const { restaurant: r } = res;
    const fate = fateMode && !tournamentMode;
    const last = fate && fateCount >= FATE_MAX;
    const status = h('div');
    const hint = acceptHint();
    const acceptBtn = acceptButton();
    const againBtn = iconButton({ name: 'rotate-cw', label: '다시 뽑기', text: '다시 뽑기', disabled: last, onClick: () => again(r) });
    const t = ticket(r, {
      stub: ticketStub(res, fate),
      buttons: [acceptBtn, againBtn, detailLink(r)],
      status,
      note: last && h('p', { class: 'fate-note' }, '운명입니다'),
    });
    acceptBtn.addEventListener('click', () => accept(r, acceptBtn, status, t, hint));
    bindGestures(t, acceptBtn, againBtn);
    showResult(h('div', {}, [printed(t), hint]));
    (acceptBtn.focus && !acceptBtn.disabled) && acceptBtn.focus({ preventScroll: true });
  }

  function renderFinal(r, total) {
    const status = h('div');
    const hint = acceptHint();
    const acceptBtn = acceptButton();
    const restart = iconButton({ name: 'rotate-ccw', label: '처음부터 다시', text: '처음부터 다시', onClick: () => start({ stale }) });
    const t = ticket(r, {
      stub: ticketStub(null, false),
      buttons: [acceptBtn, restart, detailLink(r)],
      status,
      note: h('p', { class: 'fate-note' }, [icon('trophy'), h('span', {}, total > 1 ? '최후의 1곳' : '후보가 1곳뿐이에요')]),
    });
    acceptBtn.addEventListener('click', () => accept(r, acceptBtn, status, t, hint));
    bindGestures(t, acceptBtn, restart);
    showResult(h('div', {}, [printed(t), hint]));
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
      head.replaceChildren(icon('trophy'), h('span', {}, `마음에 안 드는 곳을 지워 주세요 (${left.length}곳 남음)`));
    };
    for (const r of left) {
      const del = iconButton({ name: 'x', label: `${r.name} 빼기`, text: '빼기', cls: 'btn btn-danger-ghost' });
      const card = ticket(r, { small: true, buttons: [del, isPlace(r) && addPlaceButton(r)] });
      del.addEventListener('click', () => {
        left = left.filter((x) => candKey(x) !== candKey(r));
        card.remove();
        if (left.length === 1) renderFinal(left[0], total);
        else {
          paint();
          grid.querySelector('button')?.focus();
        }
      });
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
        daysGroup.querySelectorAll('input').forEach((i) => { i.checked = i.value === '0'; });
        start({ stale });
      },
    }, [icon('rotate-cw'), h('span', {}, '최근 방문 제외 없이 다시 뽑기')]);
    const reset = h('button', { type: 'button', class: 'btn', onClick: resetFilters }, [icon('rotate-ccw'), h('span', {}, '조건 모두 초기화')]);
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
          h('li', {}, '최근 방문 제외 기간을 줄이거나 “제외 안 함”으로 바꿔 보세요.'),
          loc && h('li', {}, '위치를 넓히거나(동 전체·다른 동) 해제해 보세요.'),
          h('li', {}, '새로운 식당을 추가해 보세요.'),
        ]),
        h('div', { class: 'actions' }, [relax, reset, iconButton({ name: 'plus', label: '식당 추가', text: '식당 추가', href: '#/restaurants/new', cls: 'btn btn-primary' })]),
      ]),
    );
  }

  // ---- 조건 요약 바 + 바텀 시트 ----
  const summaryChips = h('span', { class: 'summary-chips' });
  const summaryBtn = h('button', { type: 'button', class: 'summary-bar', 'aria-haspopup': 'dialog', onClick: () => openSheet() }, [
    summaryChips,
    h('span', { class: 'summary-cta' }, [icon('sliders'), h('span', {}, '조건')]),
  ]);

  function summaryParts() {
    const parts = [];
    const loc = locField.get();
    if (loc) parts.push(locationLabel(loc));
    if (filters.categories.length) parts.push(CATEGORIES.filter(([k]) => filters.categories.includes(k)).map(([, l]) => l).join('·'));
    if (filters.prices.length) parts.push(PRICES.filter(([k]) => filters.prices.includes(String(k))).map(([k]) => priceLabel(k)).join('·'));
    if (filters.status) parts.push(statusLabel(filters.status));
    if (filters.days > 0) parts.push(`${filters.days}일 제외`);
    if (filters.favoriteOnly) parts.push('즐겨찾기');
    return parts;
  }

  function renderSummary() {
    const parts = summaryParts();
    summaryChips.replaceChildren(
      ...(parts.length ? parts.map((p) => h('span', { class: 'summary-chip' }, p)) : [h('span', { class: 'summary-chip is-empty' }, '조건 없음 · 전체에서 뽑아요')]),
    );
    summaryBtn.setAttribute('aria-label', `추천 조건 바꾸기. 현재: ${parts.length ? parts.join(', ') : '조건 없음, 전체에서 뽑아요'}`);
  }

  const sheetTitleId = 'sheet-title';
  const sheetPanel = h('div', { class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': sheetTitleId, tabindex: '-1' }, [
    h('div', { class: 'sheet-head' }, [
      h('h2', { id: sheetTitleId }, '추천 조건'),
      iconButton({ name: 'x', label: '닫기', cls: 'btn btn-ghost', onClick: () => closeSheet() }),
    ]),
    h('div', { class: 'sheet-body' }, [
      locField.el,
      catGroup,
      priceGroup,
      statusGroup,
      daysGroup,
      h('div', { class: 'check' }, [favInput, h('label', { for: 'fav-only' }, [icon('star'), '즐겨찾기만'])]),
    ]),
    h('div', { class: 'sheet-foot' }, [
      iconButton({ name: 'check', label: '적용', text: '적용', cls: 'btn btn-primary btn-lg', onClick: () => closeSheet() }),
    ]),
  ]);
  const sheet = h('div', { class: 'sheet', hidden: true }, [
    h('div', { class: 'sheet-backdrop', onClick: () => closeSheet() }),
    sheetPanel,
  ]);
  let sheetOpener = null;
  let prevOverflow = '';
  let closeTimer = 0;

  const focusables = () => [...sheetPanel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);

  function onSheetKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
    } else if (e.key === 'Tab') {
      // 포커스가 시트 밖으로 나가지 않게 가둔다
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetPanel)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  }

  function openSheet() {
    if (!sheet.hidden) return;
    clearTimeout(closeTimer);
    sheetOpener = document.activeElement instanceof HTMLElement ? document.activeElement : summaryBtn;
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.hidden = false;
    void sheet.offsetWidth; // 슬라이드 전환을 위해 레이아웃을 확정한 뒤 클래스를 붙인다
    sheet.classList.add('is-open');
    sheet.addEventListener('keydown', onSheetKey);
    sheetPanel.focus({ preventScroll: true });
    window.addEventListener('hashchange', onSheetNav);
  }

  const onSheetNav = () => closeSheet(false);

  function closeSheet(restoreFocus = true) {
    if (sheet.hidden || !sheet.classList.contains('is-open')) return;
    window.removeEventListener('hashchange', onSheetNav);
    sheet.removeEventListener('keydown', onSheetKey);
    sheet.classList.remove('is-open');
    document.body.style.overflow = prevOverflow;
    renderSummary();
    closeTimer = setTimeout(() => { sheet.hidden = true; }, prefersReducedMotion() ? 0 : 220);
    if (restoreFocus && sheetOpener?.isConnected) sheetOpener.focus();
  }

  function renderAll() {
    outlet.replaceChildren(
      h('section', { class: 'page' }, [
        h('h1', {}, '오늘 뭐 먹지?'),
        h('p', { class: 'lead' }, '조건을 고르고 버튼을 누르면 한 곳을 골라 드려요.'),
        gapBox,
        h('form', { class: 'draw-form', onSubmit: (e) => { e.preventDefault(); start(); } }, [
          drawBtn,
          summaryBtn,
          modeGroup,
          h('div', { class: 'actions' }, [staleBtn]),
        ]),
        resultBox,
        sheet,
      ]),
    );
  }

  renderAll();
  renderSummary();
  syncModeNote();
  loadGap();
}
