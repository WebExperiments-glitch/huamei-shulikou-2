// huamei术力口 — Electron 主进程
// 模式：dev 用 Vite dev server（localhost:5173）；prod 用打包后的前端（dist/index.html）
// 职责：承载窗口 + 启动/管理 Python 后端子进程 + 生命周期清理（双击即用，无需手动开后端）。
const { app, BrowserWindow, shell, ipcMain, protocol, net } = require("electron")
const { spawn } = require("child_process")
const { pathToFileURL } = require("url")
const http = require("http")
const fs = require("fs")
const path = require("path")

const isDev = process.argv.includes("--dev") || !app.isPackaged

// 后端端口（与应用内约定一致：run_backend.py / vite proxy 默认 8010）
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 8010

// 自定义 app:// 协议：ES Module 脚本不允许 file:// 加载（Chromium CORS 拦截会白屏），
// 通过自定义特权协议 serve 前端产物即可在 file:// 环境（loadURL 自定义 scheme）下正常加载。
// 必须在 app ready 之前注册。
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
])

// 前端产物根目录：打包态取 resources/frontend，源码/开发态回退到 frontend/dist
function frontendRoot() {
  const packagedIndex = path.join(process.resourcesPath, "frontend", "index.html")
  if (fs.existsSync(packagedIndex)) return path.join(process.resourcesPath, "frontend")
  return path.join(__dirname, "..", "..", "frontend", "dist")
}

// 注册 app:// 协议处理器：把 URL 映射到前端磁盘文件，SPA 未知路径回退 index.html。
function registerAppProtocol() {
  const root = frontendRoot()
  const indexFile = path.join(root, "index.html")
  // 目录穿越护栏：文件必须落在 root 之内。用「root + 分隔符」前缀精确判断，
  // 避免 root="…/frontend" 时把 "…/frontend2/x" 误判为安全路径。
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep
  protocol.handle("app", (request) => {
    try {
      const url = new URL(request.url)
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "")
      if (!rel) rel = "index.html"
      let filePath = path.normalize(path.join(root, rel))
      if (!filePath.startsWith(rootPrefix)) filePath = indexFile // 防目录穿越
      if (!fs.existsSync(filePath)) filePath = indexFile // SPA 前端路由 fallback
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response("Not Found", { status: 404 })
    }
  })
}

let mainWindow = null
let backendProc = null

// ---------------------------------------------------------------------------
// 后端进程解析与启动
// ---------------------------------------------------------------------------
// 定位后端启动入口，优先级：
//   1) 已安装/打包态：随安装包经 extraResources 分发的 exe（resources/backend/huamei_backend.exe）
//   2) 源码开发期：backend/dist_backend/huamei_backend.exe（或回退 python run_backend.py）
function resolveBackend() {
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, "backend", "huamei_backend.exe")
    if (fs.existsSync(exe)) {
      return {
        cmd: exe,
        args: ["--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
        cwd: path.dirname(exe),
      }
    }
  }
  const root = path.join(__dirname, "..", "..") // app/desktop → 术力口/
  const exePath = path.join(root, "backend", "dist_backend", "huamei_backend.exe")
  if (fs.existsSync(exePath)) {
    return {
      cmd: exePath,
      args: ["--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
      cwd: path.dirname(exePath),
    }
  }
  const script = path.join(root, "backend", "run_backend.py")
  if (fs.existsSync(script)) {
    return {
      cmd: process.env.PYTHON || "python",
      args: [script, "--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
      cwd: path.join(root, "backend"),
    }
  }
  return null
}

function startBackend() {
  const spec = resolveBackend()
  if (!spec) {
    console.warn("[backend] 未找到后端启动器（backend/dist_backend/huamei_backend.exe 或 run_backend.py），跳过拉起。")
    return
  }
  console.log(`[backend] 启动: ${spec.cmd} ${spec.args.join(" ")}`)
  backendProc = spawn(spec.cmd, spec.args, {
    cwd: spec.cwd,
    windowsHide: true,
    // dev 态透传后端日志到本终端便于排障；prod 态静默（避免弹控制台窗）
    stdio: isDev ? "inherit" : "ignore",
  })
  backendProc.on("exit", (code, signal) => {
    console.log(`[backend] 已退出 code=${code} signal=${signal}`)
    backendProc = null
  })
  backendProc.on("error", (err) => {
    console.error("[backend] 启动失败:", err.message)
  })
}

// Windows 下递归终止进程树（PyInstaller onefile exe 可能带子进程）
function stopBackend() {
  if (!backendProc || !backendProc.pid) return
  const pid = backendProc.pid
  backendProc = null // 避免 exit 回调再递归
  try {
    // 先优雅退出，兜底用 taskkill /T 清理整棵进程树，避免孤儿进程
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true })
    console.log(`[backend] 已发送终止信号 pid=${pid}`)
  } catch (err) {
    console.warn("[backend] 终止失败:", err?.message)
  }
}

// 端口探测：只要收到任意 HTTP 状态码即视为端口就绪（FastAPI 对未知路径返回 404 也说明已连通）
function probePort(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health" }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on("error", () => resolve(false))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await probePort(port)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

// 确保后端就绪。
//  - 开发态（isDev）：优先复用外部/手动起的后端，方便调试（前端 dev server 常配好后端）。
//  - 打包态：始终先拉起内置的 huamei_backend.exe（含最新 CORS/配置），避免被外部残留进程
//    （旧版本/旧配置占着端口）干扰；仅当内置后端确实无法就绪（如端口被其它程序占用导致
//    bind 失败）时，才回退复用现有端口并给出警示，保证应用仍能启动。
async function ensureBackend() {
  if (isDev) {
    if (await probePort(BACKEND_PORT)) {
      console.log(`[backend-dev] 端口 ${BACKEND_PORT} 已有后端在监听，直接复用。`)
      return true
    }
    startBackend()
    return await waitForPort(BACKEND_PORT)
  }

  // 打包态：优先用自己的内置后端子进程
  const already = await probePort(BACKEND_PORT)
  if (already) {
    console.warn(`[backend] 端口 ${BACKEND_PORT} 已有进程监听。为保证使用内置后端（最新 CORS/配置），将尝试拉起内置后端；若绑定失败再回退复用。`)
  }
  startBackend()
  const ready = await waitForPort(BACKEND_PORT)
  if (ready) {
    console.log(`[backend] 内置后端子进程就绪（端口 ${BACKEND_PORT}）。`)
    return true
  }
  // 内置后端未能就绪（典型：端口被外部程序占用，exe bind 失败退出）→ 回退复用现有端口
  console.warn(`[backend] 内置后端未能就绪，回退复用端口 ${BACKEND_PORT} 上现有进程。`)
  return await probePort(BACKEND_PORT)
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "huamei术力口",
    backgroundColor: "#f6f7f9",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once("ready-to-show", () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url)
    return { action: "deny" }
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"
    mainWindow.loadURL(devUrl)
  } else {
    // 生产：用自定义 app:// 协议加载前端产物（见 registerAppProtocol）。
    // 加载根路径（pathname="/"）以贴合前端 SPA 路由；若加载 /index.html 会因
    // "No routes matched /index.html" 而渲染空白。
    mainWindow.loadURL("app://bundle/")
  }

  mainWindow.on("closed", () => (mainWindow = null))
}

// 暴露后端端口给渲染进程（供 API 层在 Electron 下直连）
ipcMain.handle("backend:port", () => BACKEND_PORT)

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------
// 单实例：重复启动时聚焦既有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    registerAppProtocol()
    await ensureBackend()
    createWindow()
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

// 退出前回收后端子进程，避免遗留孤儿进程
app.on("will-quit", () => {
  stopBackend()
})