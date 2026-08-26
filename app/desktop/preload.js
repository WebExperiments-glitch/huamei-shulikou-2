// 安全地暴露少量能力给渲染进程：通过 ipcRenderer 获取后端端口
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("desktop", {
  // 在 Electron 环境下可用的标记
  isDesktop: true,
  // 获取后端端口（渲染进程据此构造 API baseURL）
  getBackendPort: () => ipcRenderer.invoke("backend:port"),
})