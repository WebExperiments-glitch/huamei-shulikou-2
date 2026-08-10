/** 从任意文本 / B 站视频链接中提取 BV 号（保留原始大小写）。
 *
 * 支持：
 *   - 纯 BV 号：BV1H7GN6JEHQ
 *   - 完整 / 带参数的链接：
 *       https://www.bilibili.com/video/BV1H7GN6JEHQ/?vd_source=xxxx
 *       https://www.bilibili.com/video/BV1H7GN6JEHQ
 *   - 混在其它文字里：xxx BV1H7GN6JEHQ yyy
 *
 * 未找到返回 null。BV 号大小写敏感，这里原样保留交由后端 LOWER 匹配。
 */
export function extractBv(text: string): string | null {
  if (!text) return null
  const m = text.match(/BV[0-9A-Za-z]{10}/)
  return m ? m[0] : null
}
