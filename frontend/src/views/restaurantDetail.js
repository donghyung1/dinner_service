import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { badge, confirmDialog, errorState, favoriteButton, field, restaurantBadges, skipSuggestion, spinner } from '../components/ui.js';
import { icon, iconButton, iconLabel } from '../components/icon.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import { todayISO } from '../constants.js';

const SOURCE = { RECOMMENDATION: ['추천', 'dices'], MANUAL: ['직접 기록', 'pencil'] };

export function restaurantDetailView(outlet, { id }, ctx) {
  const root = h('section', { class: 'page' });
  outlet.replaceChildren(root);

  async function load() {
    root.replaceChildren(spinner());
    try {
      const r = await api.getRestaurant(id);
      if (!ctx.isCurrent()) return;
      render(r);
    } catch (e) {
      root.replaceChildren(
        e.status === 404
          ? h('div', { class: 'state state-empty' }, [
              h('p', { class: 'state-title' }, '식당을 찾을 수 없어요'),
              iconButton({ name: 'arrow-left', label: '목록으로', href: '#/restaurants' }),
            ])
          : errorState(e, load),
      );
    }
  }

  function visitList(r) {
    if (!r.recent_visits?.length) return h('p', { class: 'muted' }, '아직 방문 기록이 없어요.');
    return h('ul', { class: 'plain-list' }, r.recent_visits.map((v) =>
      h('li', {}, [
        h('strong', {}, v.visited_on),
        ' ',
        SOURCE[v.source] ? badge(SOURCE[v.source][0], '', { icon: SOURCE[v.source][1], iconOnly: true }) : badge(v.source),
        v.note && h('span', { class: 'muted' }, ` · ${v.note}`),
      ]),
    ));
  }

  function visitForm(r) {
    const date = h('input', { type: 'date', value: todayISO(), max: '9999-12-31', required: true });
    const note = h('input', { type: 'text', maxlength: 255, placeholder: '한 줄 메모 (선택)' });
    const dateF = field({ label: '방문일', control: date, icon: 'calendar' });
    const noteF = field({ label: '메모', control: note, icon: 'note' });
    const form = h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      dateF.setError('');
      if (!date.value) return dateF.setError('방문일을 입력해 주세요.');
      try {
        await api.createVisit({ restaurant_id: r.id, visited_on: date.value, source: 'MANUAL', note: note.value.trim() || null });
        showToast('방문 기록을 추가했어요.', 'success');
        load();
      } catch (err) {
        if (err.status === 422) dateF.setError(err.message);
        else showToast(err.message, 'error');
      }
    } }, [
      h('h3', {}, [icon('plus'), '방문 기록 추가']),
      h('div', { class: 'row-fields' }, [dateF, noteF]),
      h('button', { class: 'btn', type: 'submit', 'aria-label': '기록하기', title: '기록하기' }, [icon('check'), h('span', {}, '기록하기')]),
    ]);
    return form;
  }

  function render(r) {
    const del = iconButton({ name: 'trash', label: '삭제', cls: 'btn btn-danger-ghost' });
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '식당을 삭제할까요?',
        message: `"${r.name}"과(와) 연결된 방문 기록도 함께 삭제돼요.`,
        confirmText: '삭제',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteRestaurant(r.id);
        showToast('삭제했어요.', 'success');
        navigate('/restaurants');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
    root.replaceChildren(
      h('p', {}, iconButton({ name: 'arrow-left', label: '목록', href: '#/restaurants', cls: 'btn btn-ghost' })),
      h('article', { class: 'detail' }, [
        h('div', { class: 'page-head' }, [h('h1', {}, r.name), favoriteButton(r)]),
        restaurantBadges(r),
        skipSuggestion(r, (kind) => kind === 'deleted' && navigate('/restaurants')),
        h('dl', { class: 'facts' }, [
          h('dt', {}, iconLabel('map-pin', '위치')), h('dd', {}, r.location || '-'),
          h('dt', {}, iconLabel('note', '메모')), h('dd', { class: 'pre' }, r.memo || '-'),
          h('dt', {}, iconLabel('calendar', '마지막 방문')), h('dd', {}, r.last_visited_on || '-'),
        ]),
        h('div', { class: 'actions' }, [
          iconButton({ name: 'pencil', label: '수정', href: `#/restaurants/${r.id}/edit`, cls: 'btn btn-primary' }),
          del,
        ]),
      ]),
      h('h2', {}, [icon('history'), '최근 방문']),
      visitList(r),
      visitForm(r),
    );
  }

  load();
}
