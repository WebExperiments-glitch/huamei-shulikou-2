import { describe, expect, it } from 'vitest'

import { escapeCsvCell, fmtDate, fmtTime, joinNames, safeName, stamp, toCSV } from '../csv'

describe('escapeCsvCell', () => {
  it('null / undefined → 空串', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })
  it('含逗号/引号/换行 → 双引号包裹 + 双写引号', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
  })
  it('公式注入前缀 → 前置单引号', () => {
    expect(escapeCsvCell('=cmd')).toBe("'=cmd")
    expect(escapeCsvCell('+1')).toBe("'+1")
    expect(escapeCsvCell('@x')).toBe("'@x")
    expect(escapeCsvCell('-1')).toBe("'-1")
  })
  it('普通文本原样', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(true)).toBe('true')
  })
})

describe('toCSV', () => {
  const cols = [
    { key: 'name', label: '名称', get: (r: { name: string }) => r.name },
    { key: 'score', label: '得分', get: (r: { score: number }) => r.score },
  ]
  it('表头 + 数据，CRLF 分隔', () => {
    expect(toCSV([{ name: 'a', score: 1 }], cols)).toBe('名称,得分\r\na,1')
  })
  it('多行数据', () => {
    const rows = [
      { name: 'a', score: 1 },
      { name: 'b', score: 2 },
    ]
    expect(toCSV(rows, cols)).toBe('名称,得分\r\na,1\r\nb,2')
  })
})

describe('stamp', () => {
  it('生成 YYYYMMDD-HHMM 形式', () => {
    const s = stamp(new Date(2026, 7, 14, 7, 45)) // 8 月 14 日 07:45
    expect(s).toBe('20260814-0745')
  })
})

describe('safeName', () => {
  it('替换非法字符与空白（相邻非法字符合并为单个 _）', () => {
    expect(safeName('a/b:c*?')).toBe('a_b_c_')
    expect(safeName('hello  world')).toBe('hello_world')
  })
  it('截断到 80 字符', () => {
    expect(safeName('x'.repeat(100))).toHaveLength(80)
  })
})

describe('fmtTime / fmtDate', () => {
  it('秒级时间戳 → 可读格式', () => {
    // 2026-08-14 07:45:00 (Asia/Shanghai 是 UTC+8，构造时用本地时区)
    const sec = new Date(2026, 7, 14, 7, 45).getTime() / 1000
    expect(fmtTime(sec)).toBe('2026-08-14 07:45')
    expect(fmtDate(sec)).toBe('2026-08-14')
  })
  it('空值 → 空串', () => {
    expect(fmtTime(null)).toBe('')
    expect(fmtDate(0)).toBe('')
  })
})

describe('joinNames', () => {
  it('人名数组顿号连接', () => {
    expect(joinNames([{ name: '初音ミク' }, { name: '鏡音リン' }])).toBe('初音ミク、鏡音リン')
  })
  it('空数组 / null → 空串', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(null)).toBe('')
  })
})
