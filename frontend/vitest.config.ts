import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 纯函数单测：node 环境即可，无需 DOM / 后端代理。
// 与 vite.config.ts 分离，避免 build 时被 test 配置干扰。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.ts'],
  },
})
