import { defineConfig, loadEnv } from 'vite';

// 브라우저는 프론트엔드 서버(같은 origin)의 /api 로만 요청하고,
// Vite 서버가 백엔드로 전달한다. 백엔드 주소는 VITE_ 접두사가 없어 클라이언트 번들에 포함되지 않는다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
  };
  return {
    server: { port: 5173, host: true, proxy },
    // 외부 공개(Cloudflare Quick Tunnel)는 빌드 결과물을 preview 로 띄워 연결한다.
    preview: { port: 4173, host: true, proxy, allowedHosts: ['.trycloudflare.com'] },
  };
});
