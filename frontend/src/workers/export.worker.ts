/**
 * 数据导出后台线程（Web Worker）。
 *
 * 把 CSV / JSON / Markdown 序列化与 ZIP 打包这些 CPU 密集操作
 * 移出主线程，避免大数据量导出时页面卡顿。通过消息传递接收任务，
 * 结果以可转移（transferable）的 ArrayBuffer 回传，不产生额外拷贝。
 */

import { serialize, type ExportFormat } from "../lib/csv"
import { buildZip } from "../lib/zip"
import { COLS, type DatasetKey } from "../lib/exportSchema"

type ExportTask =
  | { id: number; kind: "serialize"; dataset: DatasetKey; rows: unknown[]; fmt: ExportFormat }
  | { id: number; kind: "zip"; entries: { name: string; data: ArrayBuffer }[] }

type Reply = { id: number; ok: boolean; bytes?: ArrayBuffer; error?: string }

// Worker 环境下的 postMessage 与主线程签名不同（第二个参数是 transfer 列表），
// 这里显式收窄类型，避免 DOM lib 下的类型冲突。
type WorkerPort = { postMessage(message: unknown, transfer: Transferable[]): void }
const port = self as unknown as WorkerPort

self.onmessage = (e: MessageEvent<ExportTask>) => {
  const task = e.data
  try {
    if (task.kind === "serialize") {
      const text = serialize(task.rows as never[], COLS[task.dataset], task.fmt)
      const payload = task.fmt === "csv" ? `\uFEFF${text}` : text
      const bytes = new TextEncoder().encode(payload).buffer as ArrayBuffer
      const reply: Reply = { id: task.id, ok: true, bytes }
      port.postMessage(reply, [bytes])
      return
    }
    const entries = task.entries.map((it) => ({ name: it.name, data: new Uint8Array(it.data) }))
    const bytes = buildZip(entries).buffer as ArrayBuffer
    const reply: Reply = { id: task.id, ok: true, bytes }
    port.postMessage(reply, [bytes])
  } catch (err) {
    const reply: Reply = { id: task.id, ok: false, error: err instanceof Error ? err.message : String(err) }
    port.postMessage(reply, [])
  }
}
