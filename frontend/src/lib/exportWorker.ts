/**
 * 数据导出 Worker 的客户端封装。
 *
 * 惰性创建单例 Worker，对外暴露 Promise 风格的接口：
 * - serializeInWorker：CSV / JSON / Markdown 序列化（CSV 自动带 BOM）
 * - zipInWorker：多文件打包 ZIP（STORE 方式）
 * 返回结果均为 UTF-8 字节（Uint8Array），主线程只负责触发下载。
 */

import ExportWorker from "../workers/export.worker?worker"
import type { ExportFormat } from "./csv"
import type { DatasetKey } from "./exportSchema"

interface SerializeReply {
  id: number
  ok: boolean
  bytes?: ArrayBuffer
  error?: string
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new ExportWorker()
    worker.onmessage = (e: MessageEvent<SerializeReply>) => {
      const { id, ok, bytes, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok && bytes) p.resolve(new Uint8Array(bytes))
      else p.reject(new Error(error ?? "导出任务失败"))
    }
    worker.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(`导出 Worker 异常：${e.message}`))
      pending.clear()
    }
  }
  return worker
}

/** 在后台线程序列化数据为字节（CSV 已带 UTF-8 BOM）。 */
export function serializeInWorker(dataset: DatasetKey, rows: unknown[], fmt: ExportFormat): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, kind: "serialize", dataset, rows, fmt })
  })
}

/** 在后台线程把多份数据打包为 zip 字节。 */
export function zipInWorker(entries: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    const transfer = entries.map((e) => {
      const buf = e.data.buffer
      // 只转移实际字节段（视图可能有偏移或比 buffer 小）
      return e.data.byteOffset === 0 && e.data.byteLength === buf.byteLength
        ? buf
        : (buf.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength) as ArrayBuffer)
    })
    getWorker().postMessage(
      {
        id,
        kind: "zip",
        entries: transfer.map((buf, i) => ({ name: entries[i]!.name, data: buf })),
      },
      transfer,
    )
  })
}
