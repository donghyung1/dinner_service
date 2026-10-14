import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { confirmDialog, emptyState, errorState, field, pager, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';

const LIMIT = 20;
const state = { from: '', to: '', offset: 0 };

export function visitsView(outlet, _params, ctx) {
  const box = h('div', { class: 'list-box', 'aria-live': 'polite' });
  let seq = 0;

  async function load() {
    const my = ++seq;
    box.setAttribute('aria-busy', 'true');
    box.replaceChildren(spinner());
    try {
      const data = await api.listVisits({ from: state.from, to: state.to, limit: LIMIT, offset: state.offset });
      if (my !== seq || !ctx.isCurrent()) return;
      if (data.items.length === 0 && data.total > 0 && state.offset > 0) {
        state.offset = Math.max(0, (Math.ceil(data.total / LIMIT) - 1) * LIMIT);
        return load();
      }
      render(data);
    } catch (e) {
      if (my === seq) box.replaceChildren(errorState(e, load));
    } finally {
      if (my === seq) box.removeAttribute('aria-busy');
    }
  }

  function render(data) {
    if (!data.items.length) {
      box.replaceChildren(
        emptyState(
          state.from || state.to ? '이 기간의 방문 기록이 없어요' : '아직 방문 기록이 없어요',
          '추천을 받고 "여기로 갈래요"를 누르면 기록돼요.',
          h('a', { class: 'btn btn-primary', href: '#/' }, '추천받으러 가기'),
        ),
      );
      return;
    }
    // 날짜별로 묶어 표시 (응답은 날짜 내림차순)
    const groups = new Map();
    for (const v of data.items) {
      if (!groups.has(v.visited_on)) groups.set(v.visited_on, []);
      groups.get(v.visited_on).push(v);
    }
    const out = [];
    for (const [date, items] of groups) {
      out.push(
        h('section', { class: 'day' }, [
          h('h2', { class: 'day-title' }, date),
          h('ul', { class: 'cards' }, items.map((v) => {
            const name = v.restaurant_name;
            const del = h('button', { type: 'button', class: 'btn btn-danger-ghost', 'aria-label': `${name} ${v.visited_on} 기록 삭제` }, '삭제');
            del.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: '방문 기록을 삭제할까요?', message: `${v.visited_on} ${name}`, confirmText: '삭제', danger: true });
              if (!ok) return;
              try {
                await api.deleteVisit(v.id);
                showToast('기록을 삭제했어요.', 'success');
                load();
              } catch (e) {
                showToast(e.message, 'error');
              }
            });
            return h('li', { class: 'card item' }, [
              h('div', { class: 'item-main' }, [
                h('a', { class: 'item-name', href: `#/restaurants/${v.restaurant_id}` }, name),
                v.note && h('p', { class: 'muted small' }, v.note),
                h('span', { class: 'badge' }, v.source === 'RECOMMENDATION' ? '추천' : '직접 기록'),
              ]),
              del,
            ]);
          })),
        ]),
      );
    }
    box.replaceChildren(...out, pager({ total: data.total, limit: data.limit, offset: data.offset, onPage: (o) => { state.offset = o; load(); } }));
  }

  const from = h('input', { type: 'date', value: state.from });
  const to = h('input', { type: 'date', value: state.to });
  const fF = field({ label: '시작일', control: from });
  const tF = field({ label: '종료일', control: to });
  const apply = (e) => {
    e?.preventDefault();
    tF.setError('');
    if (from.value && to.value && from.value > to.value) return tF.setError('종료일은 시작일 이후여야 해요.');
    state.from = from.value;
    state.to = to.value;
    state.offset = 0;
    load();
  };

  outlet.replaceChildren(
    h('section', { class: 'page' }, [
      h('h1', {}, '방문 기록'),
      h('form', { class: 'panel', onSubmit: apply }, [
        h('div', { class: 'row-fields' }, [fF, tF]),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn', type: 'submit' }, '조회'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { from.value = ''; to.value = ''; apply(); } }, '초기화'),
        ]),
      ]),
      box,
    ]),
  );
  load();
}
