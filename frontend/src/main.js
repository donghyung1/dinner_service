import '@fontsource/black-han-sans/400.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/main.css';
import { createRouter } from './router.js';
import { DATA_SOURCE_NOTICE } from './constants.js';
import { h } from './components/dom.js';
import { icon, iconButton } from './components/icon.js';
import { recommendView } from './views/recommend.js';
import { restaurantListView } from './views/restaurantList.js';
import { restaurantDetailView } from './views/restaurantDetail.js';
import { restaurantFormView } from './views/restaurantForm.js';
import { visitsView } from './views/visits.js';
import { statsView } from './views/stats.js';

const routes = [
  { path: '/', name: 'recommend', view: recommendView },
  { path: '/restaurants', name: 'restaurants', view: restaurantListView },
  { path: '/restaurants/new', name: 'restaurants', view: restaurantFormView },
  { path: '/restaurants/explore', name: 'restaurants', view: () => redirectTo('/restaurants') },
  { path: '/restaurants/:id/edit', name: 'restaurants', view: restaurantFormView },
  { path: '/restaurants/:id', name: 'restaurants', view: restaurantDetailView },
  { path: '/visits', name: 'visits', view: visitsView },
  { path: '/visits/stats', name: 'visits', view: statsView },
  { path: '/stats', name: 'visits', view: () => redirectTo('/visits/stats') },
  { path: '/explore', name: 'restaurants', view: () => redirectTo('/restaurants') },
];

// 예전 '#/explore', '#/stats' 링크 호환: 쿼리를 보존한 채 새 경로로 교체한다.
function redirectTo(path) {
  const q = window.location.hash.split('?')[1];
  window.location.replace(`#${path}${q ? `?${q}` : ''}`);
}

// 상단 메뉴: 글자는 스크린리더용(sr-only)으로만 남기고 아이콘으로 보여 준다.
document.querySelectorAll('#nav a').forEach((a) => {
  const text = a.textContent.trim();
  a.setAttribute('aria-label', text);
  a.title = text;
  a.replaceChildren(icon(a.dataset.icon, { size: '1.4em' }), h('span', { class: 'sr-only' }, text));
});

function notFound(outlet) {
  outlet.append(
    h('section', { class: 'page' }, [
      h('h1', {}, '페이지를 찾을 수 없어요'),
      h('p', {}, iconButton({ name: 'dices', label: '추천 화면으로', href: '#/' })),
    ]),
  );
}

document.getElementById('main').after(h('footer', { class: 'site-footer' }, DATA_SOURCE_NOTICE));

const outlet = document.getElementById('main');
const router = createRouter({
  routes,
  outlet,
  notFound,
  onChange(route) {
    document.querySelectorAll('#nav a').forEach((a) => {
      const on = route && a.dataset.nav === route.name;
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo?.(0, 0);
  },
});
router.start();
