// 해시 기반 라우터. 경로 패턴의 ":name" 은 params 로 전달된다.

function compile(pattern) {
  const keys = [];
  const re = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { re: new RegExp(`^${re}$`), keys };
}

function currentPath(hash = window.location.hash) {
  let p = hash.replace(/^#/, '');
  p = p.split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

/** routes: [{ path, name, view }]. 먼저 선언된 항목이 우선한다. */
function matchRoute(routes, path) {
  for (const route of routes) {
    const { re, keys } = compile(route.path);
    const m = re.exec(path);
    if (m) {
      const params = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
  }
  return null;
}

export function createRouter({ routes, outlet, notFound, onChange }) {
  let cleanup = null;
  let token = 0;

  async function render() {
    const my = ++token;
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    const path = currentPath();
    const hit = matchRoute(routes, path);
    const view = hit ? hit.route.view : notFound;
    outlet.replaceChildren();
    onChange?.(hit?.route ?? null, path);
    const result = await view(outlet, hit?.params ?? {}, { isCurrent: () => my === token });
    if (my !== token) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = result;
  }

  return {
    start() {
      window.addEventListener('hashchange', render);
      return render();
    },
  };
}

export function navigate(path) {
  window.location.hash = `#${path}`;
}
