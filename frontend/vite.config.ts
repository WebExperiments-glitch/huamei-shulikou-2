import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发环境代理后端 API，避免 CORS 问题
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
  build: {
    // 关闭自动清空 outDir：本机构建环境会把 fs.rmSync 路由到回收站并失败，
    // 导致 build 中断。关闭后由 vite 直接覆盖写入（产物为带 hash 文件名，无残留风险）。
    emptyOutDir: false,
  },
})
