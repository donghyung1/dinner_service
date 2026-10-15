// 백엔드 REST API 클라이언트. 백엔드 외의 어떤 곳과도 통신하지 않는다.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || null;
  }
}

// 인증이 필요한 요청이 401 을 받으면(세션 만료 등) 로그인 화면으로 보내는 핸들러. main.js 가 등록한다.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function getBaseUrl() {
  const base = import.meta.env?.VITE_API_BASE_URL || '/api/v1';
  return base.replace(/\/+$/, '');
}

/** 배열은 반복 키로, null/undefined/빈 문자열은 생략한다. */
function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else sp.append(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { query, body, signal, auth = true } = {}) {
  const url = `${getBaseUrl()}${path}${buildQuery(query)}`;
  // 세션 쿠키(HttpOnly)는 같은 origin 요청에 브라우저가 알아서 실어 보낸다.
  const init = { method, headers: { Accept: 'application/json' }, signal, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 401 && auth) unauthorizedHandler?.();
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code || 'HTTP_ERROR',
      err?.message || `요청에 실패했습니다. (${res.status})`,
      err?.details,
    );
  }
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { body: { username, password }, auth: false }),
  signup: (username, password) => request('POST', '/auth/signup', { body: { username, password }, auth: false }),
  logout: () => request('POST', '/auth/logout', { auth: false }),
  me: () => request('GET', '/auth/me', { auth: false }),
  listRestaurants: (query) => request('GET', '/restaurants', { query }),
  searchRestaurants: (query) => request('GET', '/restaurants/search', { query }),
  randomRestaurant: (query) => request('GET', '/restaurants/search/random', { query }),
  getRestaurant: (id) => request('GET', `/restaurants/${id}`),
  createRestaurant: (body) => request('POST', '/restaurants', { body }),
  updateRestaurant: (id, body) => request('PUT', `/restaurants/${id}`, { body }),
  deleteRestaurant: (id) => request('DELETE', `/restaurants/${id}`),
  setFavorite: (id, is_favorite) => request('PATCH', `/restaurants/${id}/favorite`, { body: { is_favorite } }),
  recommend: (query) => request('GET', '/recommendations/random', { query }),
  recommendCandidates: (query) => request('GET', '/recommendations/candidates', { query }),
  createSkip: (restaurant_id) => request('POST', '/recommendations/skips', { body: { restaurant_id } }),
  dismissSkipSuggestion: (id) => request('POST', `/restaurants/${id}/skip-suggestion/dismiss`),
  categoryGap: () => request('GET', '/stats/category-gap'),
  monthlyStats: (month) => request('GET', '/stats/monthly', { query: { month } }),
  searchPlaces: (query, signal) => request('GET', '/places', { query, signal }),
  placeRegions: (query) => request('GET', '/places/regions', { query }),
  createVisit: (body) => request('POST', '/visits', { body }),
  listVisits: (query) => request('GET', '/visits', { query }),
  deleteVisit: (id) => request('DELETE', `/visits/${id}`),
};
