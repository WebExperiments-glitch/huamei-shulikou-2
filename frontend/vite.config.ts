import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // 用相对路径打包资源：Electron 桌面版通过 file:// 加载（loadFile），
  // 绝对 /assets 会解析到磁盘根导致白屏；base './' 使 file:// 也能正确加载。
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    // 强制 three 单实例：@react-three/drei 的 stats-gl 嵌套了 three@0.170.0，
    // 若被解析会造成 "multiple instances of three" 警告与运行时类型不兼容。
    dedupe: ['three'],
  },
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
    // ECharts 按需注册（core + charts + components + CanvasRenderer）后体积约 1.1MB，
    // 且已随路由懒加载拆分为独立异步 chunk，仅图表页才会请求，属于合理体积，上调阈值避免误报。
    chunkSizeWarningLimit: 750,
  },
})
