/**
 * 轻量 ZIP 打包（STORE 方式，无压缩）。
 *
 * 纯前端生成 .zip 文件：把多个文件打包成一个 zip 下载。
 * 用于「数据导出中心」批量导出多期榜单时自动打包。
 * 采用无压缩 STORE（method=0），对 CSV/JSON/Markdown 文本足够，
 * 避免引入 jszip 等第三方依赖。
 */

/** CRC32（ZIP 校验用） */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d: Date): number {
  return (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
}
function dosDate(d: Date): number {
  return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** 组装一个 ZIP 文件的二进制内容（STORE，无压缩）。 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const now = new Date()
  const time = dosTime(now)
  const date = dosDate(now)
  const encoder = new TextEncoder()

  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const chunks: Uint8Array[] = []

  for (const e of entries) {
    const nameBytes = encoder.encode(e.name)
    const crc = crc32(e.data)

    // 本地文件头
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true) // version needed
    lh.setUint16(6, 0, true) // flags
    lh.setUint16(8, 0, true) // method: store
    lh.setUint16(10, time, true)
    lh.setUint16(12, date, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, e.data.length, true) // comp size
    lh.setUint32(22, e.data.length, true) // uncomp size
    lh.setUint16(26, nameBytes.length, true)
    lh.setUint16(28, 0, true) // extra len
    locals.push(new Uint8Array(lh.buffer), nameBytes, e.data)

    // 中央目录头
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true) // version made by
    ch.setUint16(6, 20, true) // version needed
    ch.setUint16(8, 0, true) // flags
    ch.setUint16(10, 0, true) // method
    ch.setUint16(12, time, true)
    ch.setUint16(14, date, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, e.data.length, true)
    ch.setUint32(24, e.data.length, true)
    ch.setUint16(28, nameBytes.length, true)
    ch.setUint16(30, 0, true) // extra len
    ch.setUint16(32, 0, true) // comment len
    ch.setUint16(34, 0, true) // disk start
    ch.setUint16(36, 0, true) // internal attr
    ch.setUint32(38, 0, true) // external attr
    ch.setUint32(42, offset, true) // local header offset
    centrals.push(new Uint8Array(ch.buffer), nameBytes)

    offset += 30 + nameBytes.length + e.data.length
    chunks.push(...locals.splice(0)) // 累积到输出
  }

  // 汇总长度
  let cdSize = 0
  for (const c of centrals) cdSize += c.length
  const cdStart = offset

  // 结束记录（EOCD）
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true) // disk num
  eocd.setUint16(6, 0, true) // disk with cd
  eocd.setUint16(8, entries.length, true) // entries on disk
  eocd.setUint16(10, entries.length, true) // total entries
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, cdStart, true)
  eocd.setUint16(20, 0, true) // comment len

  const all = [...chunks, ...centrals, new Uint8Array(eocd.buffer)]
  const total = all.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of all) {
    out.set(c, p)
    p += c.length
  }
  return out
}
