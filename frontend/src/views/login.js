import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { field } from '../components/ui.js';
import { icon } from '../components/icon.js';
import { setUser, takeReturnTo } from '../auth.js';

export function loginView(outlet) {
  const username = h('input', { type: 'text', name: 'username', autocomplete: 'username', maxlength: '50', autocapitalize: 'none', spellcheck: 'false' });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', maxlength: '256' });
  const fUser = field({ label: '아이디', control: username, required: true });
  const fPass = field({ label: '비밀번호', control: password, required: true });
  const formErr = h('p', { class: 'field-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, [icon('check'), h('span', {}, '로그인')]);
  const form = h('form', { novalidate: true }, [fUser, fPass, formErr, submit]);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    formErr.textContent = '';
    fUser.setError(username.value.trim() ? '' : '아이디를 입력해 주세요.');
    fPass.setError(password.value ? '' : '비밀번호를 입력해 주세요.');
    if (!username.value.trim() || !password.value) return;
    submit.disabled = true;
    try {
      const me = await api.login(username.value.trim(), password.value);
      setUser(me);
      document.body.classList.remove('is-login');
      window.location.hash = takeReturnTo();
    } catch (e) {
      submit.disabled = false;
      password.value = '';
      formErr.textContent = e.status === 401 ? e.message : e.message || '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
      password.focus();
    }
  });

  outlet.append(
    h('section', { class: 'login-page' }, [
      h('h1', {}, '로그인'),
            form,
      h('p', { class: 'hint' }, ['계정이 없나요? ', h('a', { href: '#/signup' }, '회원가입')]),
    ]),
  );
  username.focus();
}
