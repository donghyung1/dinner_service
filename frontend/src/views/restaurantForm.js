import { api } from '../api/client.js';
import { h } from '../components/dom.js';
import { errorState, field, selectEl, spinner } from '../components/ui.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import { CATEGORIES, PRICES, STATUSES } from '../constants.js';

/** 백엔드 제약(name 1~100, location ≤255, memo ≤1000, price 1~4)을 그대로 반영한 검증. */
export function validate(v) {
  const e = {};
  const name = v.name.trim();
  if (!name) e.name = '이름을 입력해 주세요.';
  else if (name.length > 100) e.name = '이름은 100자 이하여야 해요.';
  if (!v.category) e.category = '카테고리를 선택해 주세요.';
  if (!v.status) e.status = '상태를 선택해 주세요.';
  if (v.price_level !== '' && !(Number(v.price_level) >= 1 && Number(v.price_level) <= 4)) e.price_level = '가격대는 1~4 중에서 선택해 주세요.';
  if (v.location.length > 255) e.location = '위치는 255자 이하여야 해요.';
  if (v.memo.length > 1000) e.memo = '메모는 1000자 이하여야 해요.';
  return e;
}

export function restaurantFormView(outlet, params, ctx) {
  const editId = params.id;
  const root = h('section', { class: 'page' });
  outlet.replaceChildren(root);

  async function init() {
    if (!editId) return build(null);
    root.replaceChildren(spinner());
    try {
      const r = await api.getRestaurant(editId);
      if (ctx.isCurrent()) build(r);
    } catch (e) {
      root.replaceChildren(errorState(e, init));
    }
  }

  function build(r) {
    const name = h('input', { type: 'text', maxlength: 200, value: r?.name ?? '', required: true, autocomplete: 'off' });
    const category = selectEl(CATEGORIES, r?.category ?? '', { blank: '선택' });
    const status = selectEl(STATUSES, r?.status ?? 'WISHLIST');
    const price = selectEl(PRICES, r?.price_level ?? '', { blank: '선택 안 함' });
    const location = h('input', { type: 'text', value: r?.location ?? '', maxlength: 300 });
    const memo = h('textarea', { rows: 4, maxlength: 1100 });
    memo.value = r?.memo ?? '';
    const fav = h('input', { type: 'checkbox', id: 'is-fav', checked: r?.is_favorite });

    const F = {
      name: field({ label: '이름', control: name, required: true }),
      category: field({ label: '카테고리', control: category, required: true }),
      status: field({ label: '상태', control: status, required: true }),
      price_level: field({ label: '가격대', control: price }),
      location: field({ label: '위치/주소', control: location, hint: '예: 역삼역 3번 출구 앞' }),
      memo: field({ label: '메모', control: memo, hint: '최대 1000자' }),
    };
    const dupWarn = h('p', { class: 'warn', role: 'status' });
    F.name.append(dupWarn);

    name.addEventListener('blur', async () => {
      dupWarn.textContent = '';
      const n = name.value.trim();
      if (!n) return;
      try {
        const res = await api.listRestaurants({ q: n, limit: 100 });
        const dup = res.items.some((x) => x.name.trim().toLowerCase() === n.toLowerCase() && String(x.id) !== String(editId));
        if (dup) dupWarn.textContent = '같은 이름의 식당이 이미 있어요. 지점이 다르다면 그대로 저장해도 돼요.';
      } catch {
        /* 중복 확인은 부가 기능이므로 실패해도 무시 */
      }
    });

    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, '저장');
    const formErr = h('p', { class: 'field-error', role: 'alert' });

    const form = h('form', { class: 'panel', novalidate: true }, [
      F.name, F.category, F.status, F.price_level, F.location, F.memo,
      h('div', { class: 'check' }, [fav, h('label', { for: 'is-fav' }, '즐겨찾기')]),
      formErr,
      h('div', { class: 'actions' }, [
        submit,
        h('a', { class: 'btn', href: editId ? `#/restaurants/${editId}` : '#/restaurants' }, '취소'),
      ]),
    ]);

    function showErrors(errs) {
      let first = null;
      for (const [k, f] of Object.entries(F)) {
        f.setError(errs[k] || '');
        if (errs[k] && !first) first = f;
      }
      first?.querySelector('input,select,textarea')?.focus();
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      formErr.textContent = '';
      const values = { name: name.value, category: category.value, status: status.value, price_level: price.value, location: location.value, memo: memo.value };
      const errs = validate(values);
      showErrors(errs);
      if (Object.keys(errs).length) return;
      const body = {
        name: values.name.trim(),
        category: values.category,
        status: values.status,
        price_level: values.price_level === '' ? null : Number(values.price_level),
        location: values.location.trim() || null,
        memo: values.memo.trim() || null,
        is_favorite: fav.checked,
      };
      submit.disabled = true;
      try {
        const saved = editId ? await api.updateRestaurant(editId, body) : await api.createRestaurant(body);
        showToast(editId ? '수정했어요.' : '식당을 추가했어요.', 'success');
        navigate(`/restaurants/${saved.id}`);
      } catch (e) {
        submit.disabled = false;
        if (e.status === 422 && Array.isArray(e.details)) {
          const errs2 = {};
          const rest = [];
          for (const d of e.details) {
            const key = d.loc?.[d.loc.length - 1];
            if (F[key]) errs2[key] = errs2[key] || d.message;
            else rest.push(d.message);
          }
          showErrors(errs2);
          if (rest.length) formErr.textContent = rest.join(' ');
        } else {
          formErr.textContent = e.message;
        }
      }
    });

    root.replaceChildren(h('h1', {}, editId ? '식당 수정' : '식당 추가'), form);
    name.focus();
  }

  init();
}
