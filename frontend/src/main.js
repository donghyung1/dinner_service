import './styles/main.css';
import { createRouter } from './router.js';
import { DATA_SOURCE_NOTICE } from './constants.js';
import { h } from './components/dom.js';
import { recommendView } from './views/recommend.js';
import { restaurantListView } from './views/restaurantList.js';
import { restaurantDetailView } from './views/restaurantDetail.js';
import { restaurantFormView } from './views/restaurantForm.js';
import { visitsView } from './views/visits.js';
import { statsView } from './views/stats.js';
import { exploreView } from './views/explore.js';

const routes = [
  { path: '/', name: 'recommend', view: recommendView },
  { path: '/restaurants', name: 'restaurants', view: restaurantListView },
  { path: '/restaurants/new', name: 'restaurants', view: restaurantFormView },
  { path: '/restaurants/explore', name: 'restaurants', view: exploreView },
  { path: '/restaurants/:id/edit', name: 'restaurants', view: restaurantFormView },
  { path: '/restaurants/:id', name: 'restaurants', view: restaurantDetailView },
  { path: '/visits', name: 'visits', view: visitsView },
  { path: '/visits/stats', name: 'visits', view: statsView },
  { path: '/stats', name: 'visits', view: () => redirectTo('/visits/stats') },
  { path: '/explore', name: 'restaurants', view: () => redirectTo('/restaurants/explore') },
];

// 예전 '#/explore', '#/stats' 링크 호환: 쿼리를 보존한 채 새 경로로 교체한다.
function redirectTo(path) {
  const q = window.location.hash.split('?')[1];
  window.location.replace(`#${path}${q ? `?${q}` : ''}`);
}

function notFound(outlet) {
  outlet.append(
    h('section', { class: 'page' }, [
      h('h1', {}, '페이지를 찾을 수 없어요'),
      h('p', {}, h('a', { href: '#/', class: 'btn' }, '추천 화면으로')),
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
