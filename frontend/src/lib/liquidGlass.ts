/**
 * 液态玻璃（Liquid Glass）核心算法。
 *
 * 原理：Apple iOS 26 的 Liquid Glass 是「凸透镜边缘折射 + 镜面高光」。
 * 浏览器复刻：生成一张 SDF（有向距离场）置换贴图驱动 SVG feDisplacementMap，
 * 通过 CSS filter: url(#id) 作用到玻璃内的「背景镜像层」上。
 *
 * 为什么不用 backdrop-filter: url(#id)？
 * 实测（Chromium 146 / Electron 41）：backdrop-filter 的引用滤镜链中 feImage
 * 无论 dataURL、网络 URL 还是文档内引用都不产出内容，SourceAlpha 也是全不透明
 * 矩形；而普通 filter: url() 里 feImage + feDisplacementMap 完全正常
 * （实测边缘位移 17px）。因此采用「镜像背景层 + filter」架构，全浏览器可用。
 *
 * 贴图编码：R/G 通道 = 边缘外法线方向 × 强度，128 为中性（不位移）；
 * feDisplacementMap scale 取负值 → 边缘向内采样 → 放大镜观感。
 * 中心保持中性灰：平板玻璃中心不弯光，只有边缘 bezel 环带渐变。
 */

export interface LensSpec {
  /** 玻璃元素宽（px，会按 8px 量化） */
  width: number
  /** 玻璃元素高（px，会按 8px 量化） */
  height: number
  /** 圆角半径（px，按 2px 量化） */
  radius: number
  /** 边缘斜面宽度 px；默认 min(w,h)*0.45，clamp 10..48 */
  bezel?: number
  /** 透镜环相对贴图边缘的内缩（= 镜像层外扩 bleed，px） */
  inset?: number
}

const cache = new Map<string, string>()

const quantize = (n: number, step = 8) => Math.max(0, Math.round(n / step) * step)

/** 圆角矩形 SDF：负值在内部，|d| 即到边缘的距离 */
function sdRoundedBox(px: number, py: number, bx: number, by: number, r: number): number {
  const qx = Math.abs(px) - bx
  const qy = Math.abs(py) - by
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/** 镜像层需要向四周外扩的 bleed（px），保证位移采样不越界出缝 */
export function lensBleed(strength: number): number {
  return Math.ceil(strength * 1.25) + 6
}

/**
 * 生成 SDF 置换贴图（canvas → PNG dataURL，按参数缓存）。
 * 贴图尺寸 = 量化后的 (w + 2*inset) × (h + 2*inset)，透镜环位于 inset 内缩处，
 * 环外（bleed 区）保持中性——这样贴图既能覆盖镜像层出血，又让折射精准落在玻璃边缘。
 */
export function lensMap(spec: LensSpec): string | null {
  if (typeof document === "undefined") return null
  const w = quantize(spec.width)
  const h = quantize(spec.height)
  const r = Math.min(quantize(spec.radius, 2), Math.floor(Math.min(w, h) / 2))
  const inset = Math.max(0, Math.round(spec.inset ?? 0))
  if (w < 8 || h < 8) return null
  const bezel = spec.bezel ?? Math.round(Math.min(48, Math.max(10, Math.min(w, h) * 0.45)))

  const key = `${w}x${h}r${r}b${bezel}i${inset}`
  const hit = cache.get(key)
  if (hit) return hit

  // 贴图分辨率封顶（长边 ≤720），拉伸回元素由 preserveAspectRatio="none" 完成
  const mw0 = w + inset * 2
  const mh0 = h + inset * 2
  const k = Math.min(1, 720 / Math.max(mw0, mh0))
  const mw = Math.max(8, Math.round(mw0 * k))
  const mh = Math.max(8, Math.round(mh0 * k))
  const mr = r * k
  const mb = Math.max(2, bezel * k)

  const canvas = document.createElement("canvas")
  canvas.width = mw
  canvas.height = mh
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const img = ctx.createImageData(mw, mh)
  const data = img.data
  const cx = mw / 2
  const cy = mh / 2
  const bx = (mw - w * k) / 2
  const by = (mh - h * k) / 2

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = (y * mw + x) * 4
      const d = sdRoundedBox(x - cx, y - cy, bx, by, mr)
      // 玻璃外（bleed 区）与斜面以内的平板区：中性，不位移
      if (d >= 0 || -d >= mb) {
        data[i] = 128
        data[i + 1] = 128
        data[i + 2] = 255
        data[i + 3] = 255
        continue
      }
      // 数值梯度 → 外法线方向
      const gx =
        sdRoundedBox(x - cx + 1, y - cy, bx, by, mr) - sdRoundedBox(x - cx - 1, y - cy, bx, by, mr)
      const gy =
        sdRoundedBox(x - cx, y - cy + 1, bx, by, mr) - sdRoundedBox(x - cx, y - cy - 1, bx, by, mr)
      const gl = Math.hypot(gx, gy) || 1
      // 凸透镜剖面：斜率在边缘最陡、向内衰减到 0
      const t = -d / mb
      const mag = Math.pow(1 - t, 1.8)
      data[i] = Math.round(128 + (gx / gl) * mag * 127)
      data[i + 1] = Math.round(128 + (gy / gl) * mag * 127)
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL("image/png")
  if (cache.size > 60) cache.clear()
  cache.set(key, url)
  return url
}

/**
 * 将 replica 子树内的 CSS 动画对齐 source 子树内同名动画的当前相位。
 * 用于镜像层：极光/光斑副本与页面真实背景动画同时起步才不会在玻璃边缘穿帮。
 */
export function syncCssAnimations(source: Element | null, replica: Element | null): void {
  if (!source || !replica || typeof source.getAnimations !== "function") return
  let src: CSSAnimation[]
  let dst: CSSAnimation[]
  try {
    src = source.getAnimations({ subtree: true }) as CSSAnimation[]
    dst = replica.getAnimations({ subtree: true }) as CSSAnimation[]
  } catch {
    return
  }
  for (const d of dst) {
    const s = src.find((a) => a.animationName === d.animationName && a.playState === "running")
    if (s && s.currentTime !== null) d.currentTime = s.currentTime
  }
}
