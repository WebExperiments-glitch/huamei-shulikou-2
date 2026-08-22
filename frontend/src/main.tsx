import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'animate.css' // Animate.css 工具动画库（animate__* 类，配合 fx 门控使用）
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
