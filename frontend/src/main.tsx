import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'animate.css' // Animate.css 工具动画库（animate__* 类，配合 fx 门控使用）
import './index.css'
import App from './App.tsx'
import { initApiBase } from './lib/apis/request'

// 应用渲染前先解析 API 基础地址（Electron 桌面态下直连本地后端端口），
// 避免首屏请求打到失效的路径。
void initApiBase().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
