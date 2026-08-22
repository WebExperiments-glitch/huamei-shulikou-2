import { describe, expect, it } from 'vitest'

import { fmtInt, fmtWan, pick, tierOf } from '../format'

describe('fmtInt', () => {
  it('null / NaN → 占位符', () => {
    expect(fmtInt(null)).toBe('—')
    expect(fmtInt(undefined)).toBe('—')
    expect(fmtInt(NaN)).toBe('—')
  })
  it('四舍五入并千分位', () => {
    expect(fmtInt(1234)).toBe('1,234')
    expect(fmtInt(1234.6)).toBe('1,235')
  })
})

describe('fmtWan', () => {
  it('null → 占位符', () => {
    expect(fmtWan(null)).toBe('—')
  })
  it('亿 / 万 / k / 原始值', () => {
    expect(fmtWan(2_0000_0000)).toBe('2.00亿')
    expect(fmtWan(5_0000)).toBe('5.0万')
    expect(fmtWan(2500)).toBe('2.5k')
    expect(fmtWan(999)).toBe('999')
  })
})

describe('tierOf', () => {
  it('按播放量分档', () => {
    expect(tierOf(2_0000_0000).key).toBe('myth')
    expect(tierOf(5_000_000).key).toBe('legend')
    expect(tierOf(200_000).key).toBe('hall')
    expect(tierOf(500).key).toBe('')
  })
  it('null → 空档', () => {
    expect(tierOf(null).key).toBe('')
  })
})

describe('pick', () => {
  it('按别名顺序取第一个数字', () => {
    expect(pick({ view: 1, views: 2 }, 'view', 'views')).toBe(1)
    expect(pick({ views: 2 }, 'view', 'views')).toBe(2)
  })
  it('无命中返回 undefined', () => {
    expect(pick({ a: 'x' }, 'view', 'views')).toBeUndefined()
  })
})
