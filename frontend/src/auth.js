// 로그인 상태(메모리에만 보관). 세션 자체는 서버가 준 HttpOnly 쿠키이며 JS 는 토큰을 볼 수 없다.
import { api } from './api/client.js';
import { h } from './components/dom.js';
import { iconButton } from './components/icon.js';

let currentUser = null;
let returnTo = null; // 로그인 후 돌아갈 원래 해시 경로

export const getUser = () => currentUser;

export async function loadSession() {
  try {
    currentUser = await api.me();
  } catch {
    currentUser = null;
  }
  renderUserBox();
  return currentUser;
}

export function setUser(user) {
  currentUser = user;
  renderUserBox();
}

/** 로그인 화면으로 보낸다. 현재 위치를 기억했다가 로그인 후 돌아온다. */
export function rememberReturn() {
  const hash = window.location.hash;
  if (/^#\/(login|signup)(\?|$)/.test(hash)) return false; // 이미 인증 화면이면 그대로 둔다
  returnTo = hash && hash !== '#' ? hash : null;
  return true;
}

export function goToLogin() {
  currentUser = null;
  renderUserBox();
  if (rememberReturn()) window.location.hash = '#/login';
}

export function takeReturnTo() {
  const t = returnTo && returnTo.startsWith('#/') ? returnTo : '#/';
  returnTo = null;
  return t;
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    // 서버에 닿지 않아도 화면은 로그아웃 상태로 만든다.
  }
  returnTo = null;
  currentUser = null;
  renderUserBox();
  window.location.hash = '#/login';
}

/** 상단 바 우측: 사용자 이름 + 로그아웃. 로그인 화면에서는 메뉴와 함께 숨긴다. */
export function renderUserBox() {
  const box = document.getElementById('userbox');
  if (!box) return;
  box.replaceChildren();
  box.hidden = !currentUser;
  if (!currentUser) return;
  box.append(
    h('span', { class: 'user-name' }, currentUser.username),
    iconButton({ name: 'log-out', label: '로그아웃', cls: 'btn btn-ghost', onClick: logout }),
  );
}
