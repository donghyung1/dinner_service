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
import { loginView } from './views/login.js';
import { signupView } from './views/signup.js';
import { setUnauthorizedHandler } from './api/client.js';
import { getUser, goToLogin, loadSession, rememberReturn } from './auth.js';

const routes = [
  { path: '/login', name: 'login', view: loginView },
  { path: '/signup', name: 'login', view: signupView },
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

// 주 메뉴: 아이콘 + 보이는 짧은 글자. (모바일에서는 CSS 가 하단 탭 바로 배치한다)
document.querySelectorAll('#nav a').forEach((a) => {
  const text = a.textContent.trim();
  a.removeAttribute('title');
  a.replaceChildren(icon(a.dataset.icon, { size: '1.4em' }), h('span', { class: 'nav-text' }, text));
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
// 세션이 없거나 만료되어 어떤 API 든 401 을 받으면 로그인 화면으로 보낸다(로그인 후 원래 화면으로 복귀).
setUnauthorizedHandler(goToLogin);

const router = createRouter({
  routes,
  outlet,
  notFound,
  // 로그인하지 않았으면 모든 화면을 로그인으로, 로그인한 상태에서 #/login 은 홈으로 보낸다.
  guard(path) {
    if (!getUser()) {
      if (path !== '/login' && path !== '/signup') {
        rememberReturn();
        return '/login';
      }
      return null;
    }
    return path === '/login' || path === '/signup' ? '/' : null;
  },
  onChange(route) {
    document.body.classList.toggle('is-login', route?.name === 'login');
    document.querySelectorAll('#nav a').forEach((a) => {
      const on = route && a.dataset.nav === route.name;
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo?.(0, 0);
  },
});
await loadSession(); // 쿠키가 유효한지 /auth/me 로 확인한 뒤 첫 화면을 그린다
router.start();
