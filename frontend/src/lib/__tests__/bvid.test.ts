import { describe, expect, it } from 'vitest'

import { extractBv } from '../bvid'

describe('extractBv', () => {
  it('纯 BV 号', () => {
    expect(extractBv('BV1H7GN6JEHQ')).toBe('BV1H7GN6JEHQ')
  })
  it('完整链接', () => {
    expect(extractBv('https://www.bilibili.com/video/BV1H7GN6JEHQ')).toBe('BV1H7GN6JEHQ')
  })
  it('带参数链接', () => {
    expect(extractBv('https://www.bilibili.com/video/BV1H7GN6JEHQ/?vd_source=abc')).toBe(
      'BV1H7GN6JEHQ',
    )
  })
  it('混在文字里', () => {
    expect(extractBv('请看 BV1H7GN6JEHQ 这首歌')).toBe('BV1H7GN6JEHQ')
  })
  it('未找到返回 null', () => {
    expect(extractBv('没有BV号')).toBeNull()
    expect(extractBv('')).toBeNull()
  })
})
