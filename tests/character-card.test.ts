import { describe, expect, it } from 'vitest'
import { compileCharacterCard, parseCharacterCard, type CardField } from '../src/modules/bots/ai/character-card'

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const card = (extra: Record<string, unknown> = {}) => ({ spec: 'chara_card_v3', spec_version: '3.0', data: {
  name: 'ヤマトタケル', description: '{{char}} 的背景', personality: '开朗', mes_example: '{{user}}：你好',
  first_mes: '欢迎', alternate_greetings: ['早上好'], creator_notes: '不得当作人格的作者备注',
  character_book: { entries: [{ comment: '关系', content: '保护伙伴', enabled: true },
    { comment: '关闭条目', content: '不能加入', enabled: false }] }, ...extra,
} })
const fields: CardField[] = ['description', 'personality', 'mes_example']
function png(...metadata: [string, string][]) {
  const chunks: number[] = [137, 80, 78, 71, 13, 10, 26, 10]
  for (const [key, data] of metadata) {
    const encoded = btoa(String.fromCharCode(...bytes(JSON.parse(data))))
    const payload = [...new TextEncoder().encode(`${key}\0${encoded}`)]
    const n = payload.length
    chunks.push(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, 116, 69, 88, 116, ...payload, 0, 0, 0, 0)
  }
  chunks.push(0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0)
  return new Uint8Array(chunks)
}

describe('character card files and static QQ conversion', () => {
  it('parses v1/v2/v3 without exposing arbitrary metadata as persona', () => {
    expect(parseCharacterCard(bytes({ name: '旧卡', description: '旧设定' }), 'a.json').format).toBe('V1')
    expect(parseCharacterCard(bytes({ ...card(), spec: 'chara_card_v2', spec_version: '2.0' }), 'a.json').format).toBe('V2')
    const parsed = parseCharacterCard(bytes(card()), 'a.json')
    expect(parsed.format).toBe('V3')
    const result = compileCharacterCard(parsed, { name: parsed.name, fields, worldbook: [0, 1] })
    expect(result.persona).toContain('ヤマトタケル 的背景')
    expect(result.persona).toContain('当前发言者：你好')
    expect(result.persona).toContain('保护伙伴')
    expect(result.persona).not.toMatch(/不能加入|作者备注|欢迎|早上好/)
  })
  it('reads PNG metadata as UTF-8 and prefers ccv3 over chara', () => {
    const image = png(['chara', JSON.stringify({ name: '旧卡', description: 'old' })], ['ccv3', JSON.stringify(card())])
    expect(parseCharacterCard(image, 'card.png').name).toBe('ヤマトタケル')
  })
  it('rejects corrupt, empty and unrecognized files', () => {
    expect(() => parseCharacterCard(new Uint8Array([1, 2]), 'a.png')).toThrow()
    expect(() => parseCharacterCard(png(), 'a.png')).toThrow(/元数据/)
    const corrupt = png(['chara', JSON.stringify(card())]); corrupt[8] = 127
    expect(() => parseCharacterCard(corrupt, 'a.png')).toThrow(/损坏/)
    expect(() => parseCharacterCard(bytes({ spec: 'other', data: card().data }), 'a.json')).toThrow(/格式/)
    expect(() => parseCharacterCard(bytes(card({ personality: ['wrong'] })), 'a.json')).toThrow(/性格/)
  })
  it('rejects oversized input and an empty compiled persona', () => {
    expect(() => parseCharacterCard(new Uint8Array(2 * 1024 * 1024 + 1), 'a.json')).toThrow(/2 MiB/)
    const parsed = parseCharacterCard(bytes(card()), 'a.json')
    expect(() => compileCharacterCard(parsed, { name: parsed.name, fields: [], worldbook: [] })).toThrow(/至少/)
  })
  it('enforces Unicode character limits without cutting text', () => {
    const prefix = '【角色】\nヤマトタケル\n\n【角色描述】\n'
    const parsed = parseCharacterCard(bytes(card({ description: '甲'.repeat(12000 - [...prefix].length) })), 'a.json')
    const result = compileCharacterCard(parsed, { name: parsed.name, fields: ['description'], worldbook: [] })
    expect([...result.persona]).toHaveLength(12000)
    parsed.fields.description += '乙'
    expect(() => compileCharacterCard(parsed, { name: parsed.name, fields: ['description'], worldbook: [] })).toThrow(/12,000/)
    expect(() => compileCharacterCard(parsed, { name: '名'.repeat(33), fields, worldbook: [] })).toThrow(/32/)
  })
  it('keeps HTML as text and reports unsupported scripting and templates', () => {
    const parsed = parseCharacterCard(bytes(card({ description: '<script>alert(1)</script> {{unknown}}',
      extensions: { regex_scripts: [{ scriptName: 'ignored' }] } })), 'a.json')
    expect(parsed.warnings.length).toBeGreaterThan(0)
    expect(parsed.fields.description).toContain('<script>')
    expect(compileCharacterCard(parsed, { name: parsed.name, fields: ['description'], worldbook: [] }).persona).not.toContain('ignored')
  })
  it('does not stall on long unfinished HTML and template delimiters', () => {
    const start = performance.now()
    parseCharacterCard(bytes(card({ description: '<'.repeat(100000) + '{'.repeat(100000) })), 'a.json')
    expect(performance.now() - start).toBeLessThan(1500)
  })
  it('reports V3 assets and group-only greetings that are not imported', () => {
    const parsed = parseCharacterCard(bytes(card({ group_only_greetings: ['群聊开场'],
      assets: [{ type: 'icon', uri: 'https://example.test/portrait.png', name: 'portrait', ext: 'png' }] })), 'a.json')
    expect(parsed.warnings.join(' ')).toMatch(/资源/)
    expect(parsed.warnings.join(' ')).toMatch(/群聊.*开场/)
  })
})
