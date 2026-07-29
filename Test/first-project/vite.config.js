import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const proxyTarget =
    env.VITE_API_PROXY_TARGET ||
    process.env.VITE_API_PROXY_TARGET ||
    'http://localhost:8080'

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_ID__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
          process.env.GITHUB_SHA?.slice(0, 7) ||
          'local'
      ),
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        // POST /sms/test/{ticketId} — 탑승 안내 문자 테스트 발송
        '/sms': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
