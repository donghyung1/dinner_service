import { api } from '../api/client.js';
import { h, nextId } from './dom.js';
import { badge } from './ui.js';
import { icon } from './icon.js';
import { categoryLabel, DATA_SOURCE_NOTICE } from '../constants.js';

const DEBOUNCE_MS = 300;
const MIN_LEN = 2;

/**
 * "공공데이터에서 찾기" 검색 영역 (등록 화면 전용). 모든 외부 데이터는 textContent(h 헬퍼의 텍스트 노드)로만 출력한다.
 * onSelect(place) 는 결과 항목을 눌렀을 때 호출된다.
 */
export function placeFinder({ onSelect }) {
  const inputId = nextId('place-q');
  const input = h('input', {
    type: 'search', id: inputId, autocomplete: 'off', maxlength: 50,
    placeholder: '상호명이나 동네로 검색 (예: 역삼 김밥)', 'aria-describedby': `${inputId}-msg`,
  });
  const msg = h('p', { class: 'hint', id: `${inputId}-msg`, role: 'status', 'aria-live': 'polite' }, '2글자 이상 입력하면 공공데이터에서 찾아요. 직접 입력해도 돼요.');
  const list = h('ul', { class: 'place-results plain-list' });
  const box = h('section', { class: 'panel place-finder', 'aria-labelledby': `${inputId}-title` }, [
    h('h2', { id: `${inputId}-title`, class: 'place-title' }, [icon('landmark'), '공공데이터에서 찾기']),
    h('label', { for: inputId, class: 'sr-only' }, '공공데이터 식당 검색'),
    input,
    msg,
    list,
    h('p', { class: 'hint source' }, DATA_SOURCE_NOTICE),
  ]);

  let timer = null;
  let ctrl = null;

  function render(items) {
    list.replaceChildren(
      ...items.map((p) => {
        const btn = h('button', { type: 'button', class: 'place-item' }, [
          h('span', { class: 'place-name' }, p.branch_name ? `${p.name} ${p.branch_name}` : p.name),
          h('span', { class: 'badges' }, [
            badge(categoryLabel(p.category), 'badge-cat', { icon: 'utensils' }),
            p.already_registered && badge('등록됨', 'badge-regular', { icon: 'circle-check', iconOnly: true }),
          ]),
          h('span', { class: 'muted small place-addr' }, p.location || '주소 정보 없음'),
        ]);
        btn.addEventListener('click', () => onSelect(p));
        return h('li', {}, btn);
      }),
    );
  }

  async function search() {
    const q = input.value.trim();
    ctrl?.abort();
    if (q.length < MIN_LEN) {
      render([]);
      msg.textContent = '2글자 이상 입력하면 공공데이터에서 찾아요. 직접 입력해도 돼요.';
      return;
    }
    ctrl = new AbortController();
    msg.textContent = '찾는 중…';
    try {
      const res = await api.searchPlaces({ q, limit: 20 }, ctrl.signal);
      render(res.items);
      msg.textContent = res.items.length
        ? `${res.items.length}건. 항목을 누르면 아래 폼이 채워져요.`
        : '검색 결과가 없어요. 공공데이터가 아직 임포트되지 않았을 수도 있어요. 아래에 직접 입력해 주세요.';
    } catch (e) {
      if (e?.name === 'AbortError') return;
      render([]);
      msg.textContent = `검색하지 못했어요. 직접 입력해도 돼요. (${e.message})`;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(timer);
      search();
    }
  });

  box.destroy = () => {
    clearTimeout(timer);
    ctrl?.abort();
  };
  return box;
}
