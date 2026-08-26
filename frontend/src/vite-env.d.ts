/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Electron preload (preload.js) 通过 contextBridge 暴露的桌面桥接能力。 */
interface DesktopBridge {
  readonly isDesktop: boolean
  getBackendPort(): Promise<number>
}

interface Window {
  desktop?: DesktopBridge
}
