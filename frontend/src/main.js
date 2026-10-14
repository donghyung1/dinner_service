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
  { path: '/restaurants/:id/edit', name: 'restaurants', view: restaurantFormView },
  { path: '/restaurants/:id', name: 'restaurants', view: restaurantDetailView },
  { path: '/visits', name: 'visits', view: visitsView },
  { path: '/stats', name: 'stats', view: statsView },
  { path: '/explore', name: 'explore', view: exploreView },
];

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
