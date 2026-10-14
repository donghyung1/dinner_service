import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { emptyState, errorState, spinner, visitTabs } from '../components/ui.js';
import { categoryLabel } from '../constants.js';
import { icon, iconButton, iconLabel } from '../components/icon.js';

const pad = (n) => String(n).padStart(2, '0');
const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;

function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  return monthOf(new Date(y, mo - 1 + delta, 1));
}
function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${y}년 ${Number(mo)}월`;
}

export function statsView(outlet, _params, ctx) {
  const nowMonth = monthOf(new Date());
  let month = nowMonth;
  let seq = 0;
  const body = h('div', { 'aria-live': 'polite' });

  const prev = iconButton({ name: 'chevron-left', label: '이전 달', onClick: () => go(-1) });
  const next = iconButton({ name: 'chevron-right', label: '다음 달', onClick: () => go(1) });
  const title = h('h2', { class: 'month-title' });

  function go(delta) {
    const m = shiftMonth(month, delta);
    if (m > nowMonth) return;
    month = m;
    load();
  }

  function stat(label, value, sub, iconName) {
    return h('div', { class: 'card stat' }, [
      h('p', { class: 'stat-label' }, iconLabel(iconName, label)),
      h('p', { class: 'stat-value' }, value),
      sub && h('p', { class: 'muted small' }, sub),
    ]);
  }

  function render(d) {
    const total = d.total_visits ?? 0;
    const skip = stat('넘긴 횟수', `${d.skip_count ?? 0}회`, '다시 뽑기 기준', 'skip');
    if (total === 0) {
      body.replaceChildren(
        emptyState('이 달의 기록이 없어요', '추천 결과에서 체크(✓)를 누르면 회고에 쌓여요.', iconButton({ name: 'dices', label: '추천받으러 가기', text: '추천받으러 가기', href: '#/', cls: 'btn btn-primary' })),
        h('div', { class: 'stat-grid' }, skip),
      );
      return;
    }
    const acc = d.recommendation || {};
    const accValue = acc.accept_ratio == null ? '-' : pct(acc.accept_ratio);
    const dist = d.category_distribution || [];
    const maxCount = Math.max(1, ...dist.map((c) => c.count));
    const st = d.longest_category_streak;

    const bars = h('ul', { class: 'bars' }, dist.filter((c) => c.count > 0).map((c) => {
      const ratio = c.ratio ?? c.count / total;
      return h('li', {}, [
        h('div', { class: 'bar-head' }, [h('span', {}, categoryLabel(c.category)), h('span', {}, `${c.count}건 · ${pct(ratio)}`)]),
        h('div', { class: 'bar-track', role: 'img', 'aria-label': `${categoryLabel(c.category)} ${c.count}건` },
          h('div', { class: 'bar-fill', style: `width: ${Math.max(2, (c.count / maxCount) * 100)}%` })),
      ]);
    }));

    const top = (d.top_restaurants || []).slice(0, 3);
    const rank = top.length
      ? h('ol', { class: 'rank' }, top.map((t, i) => h('li', { class: `card${i === 0 ? ' top' : ''}` }, [
          h('a', { href: `#/restaurants/${t.restaurant_id}` }, t.name),
          h('span', { class: 'count' }, `${t.count}회`),
        ])))
      : h('p', { class: 'muted' }, '-');

    let streak = h('p', { class: 'muted' }, '-');
    if (st) {
      const range = st.from === st.to ? st.from : `${st.from} ~ ${st.to}`;
      streak = h('p', {}, [h('strong', {}, `${categoryLabel(st.category)} ${st.length}번 연속`), ` (${range})`]);
    }

    body.replaceChildren(
      h('div', { class: 'stat-grid' }, [
        stat('총 방문', `${total}건`, undefined, 'footprints'),
        stat('추천 수락 비율', accValue, acc.accepted_count != null ? `추천으로 ${acc.accepted_count}건 / 전체 ${total}건` : undefined, 'thumbs-up'),
        skip,
      ]),
      h('h2', {}, [icon('chart'), '카테고리 분포']),
      h('div', { class: 'card' }, bars),
      h('h2', {}, [icon('trophy'), '가장 많이 간 식당 TOP 3']),
      rank,
      h('h2', {}, [icon('repeat'), '최장 연속 같은 카테고리']),
      h('div', { class: 'card' }, streak),
    );
  }

  async function load() {
    const my = ++seq;
    title.textContent = monthLabel(month);
    next.disabled = month >= nowMonth;
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(spinner());
    try {
      const data = await api.monthlyStats(month);
      if (my !== seq || !ctx.isCurrent()) return;
      render(data);
    } catch (e) {
      if (my === seq && ctx.isCurrent()) body.replaceChildren(errorState(e, load));
    } finally {
      if (my === seq) body.removeAttribute('aria-busy');
    }
  }

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('div', { class: 'page-head' }, h('h1', {}, [icon('notebook-pen', { size: '1.1em' }), '기록'])),
      visitTabs('stats'),
      h('div', { class: 'month-nav' }, [prev, title, next]),
      body,
    ]),
  );
  load();
}
