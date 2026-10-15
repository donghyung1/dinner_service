import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { field } from '../components/ui.js';
import { icon } from '../components/icon.js';
import { setUser, takeReturnTo } from '../auth.js';

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export function signupView(outlet) {
  const username = h('input', { type: 'text', name: 'username', autocomplete: 'username', maxlength: '30', autocapitalize: 'none', spellcheck: 'false' });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'new-password', maxlength: '128' });
  const confirm = h('input', { type: 'password', name: 'confirm', autocomplete: 'new-password', maxlength: '128' });
  const fUser = field({ label: '아이디', control: username, required: true, hint: '영문, 숫자, _ 로 3~30자' });
  const fPass = field({ label: '비밀번호', control: password, required: true, hint: '8자 이상' });
  const fConfirm = field({ label: '비밀번호 확인', control: confirm, required: true });
  const formErr = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, [icon('check'), h('span', {}, '가입하기')]);
  const form = h('form', { novalidate: true }, [fUser, fPass, fConfirm, formErr, submit]);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    formErr.textContent = '';
    const u = username.value.trim();
    const eu = USERNAME_RE.test(u) ? '' : '아이디는 영문, 숫자, _ 로 3~30자여야 해요.';
    const ep = password.value.length >= 8 && password.value.length <= 128 ? '' : '비밀번호는 8자 이상 128자 이하여야 해요.';
    const ec = confirm.value === password.value ? '' : '비밀번호가 서로 달라요.';
    fUser.setError(eu);
    fPass.setError(ep);
    fConfirm.setError(ec);
    if (eu || ep || ec) return;
    submit.disabled = true;
    try {
      const me = await api.signup(u, password.value);
      setUser(me);
      window.location.hash = takeReturnTo();
    } catch (e) {
      submit.disabled = false;
      formErr.textContent = e.status === 422 ? '아이디와 비밀번호 형식을 확인해 주세요.' : e.message;
    }
  });

  outlet.append(
    h('section', { class: 'login-page' }, [
      h('h1', {}, '회원가입'),
      h('p', { class: 'hint' }, '식당 목록은 모든 계정이 함께 보고 고쳐요.'),
      form,
      h('p', { class: 'hint' }, ['이미 계정이 있나요? ', h('a', { href: '#/login' }, '로그인')]),
    ]),
  );
  username.focus();
}
