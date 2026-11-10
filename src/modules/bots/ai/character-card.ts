export const CARD_FIELDS = [
  { key: 'description', label: '角色描述', initial: true },
  { key: 'personality', label: '性格', initial: true },
  { key: 'scenario', label: '背景场景', initial: true },
  { key: 'mes_example', label: '示例对话', initial: true },
  { key: 'system_prompt', label: '角色要求', initial: true },
  { key: 'post_history_instructions', label: '补充要求', initial: true },
  { key: 'first_mes', label: '开场参考', initial: false },
  { key: 'alternate_greetings', label: '其他开场参考', initial: false },
] as const
export type CardField = typeof CARD_FIELDS[number]['key']
export interface ImportedCard {
  name: string
  format: 'V1' | 'V2' | 'V3'
  creator: string
  version: string
  fields: Record<CardField, string>
  worldbook: { title: string; content: string; enabled: boolean }[]
  warnings: string[]
}
const JSON_LIMIT = 2 * 1024 * 1024
export const CARD_FILE_LIMIT = 10 * 1024 * 1024
export const personaLength = (text: string) => Array.from(text).length

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('角色卡格式错误：需要 JSON 对象。')
  return value as Record<string, unknown>
}
function text(value: unknown, label: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`${label}必须是文本。`)
  return value.trim()
}
function decode(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') }
  catch { throw new Error('角色卡文本编码无效，请使用 UTF-8 JSON 或重新导出 PNG。') }
}
function json(bytes: Uint8Array): unknown {
  if (bytes.byteLength > JSON_LIMIT) throw new Error('角色卡 JSON 不能超过 2 MiB。')
  const value = decode(bytes)
  try { return JSON.parse(value) }
  catch { throw new Error('角色卡 JSON 损坏，无法解析。') }
}

function pngText(type: string, data: Uint8Array): { key: string; value: Uint8Array } | null {
  const separator = data.indexOf(0)
  if (separator < 0) return null
  const key = String.fromCharCode(...data.subarray(0, Math.min(separator, 80)))
  if (key !== 'chara' && key !== 'ccv3') return null
  if (type === 'tEXt') return { key, value: data.subarray(separator + 1) }
  if (type === 'zTXt' || data[separator + 1] !== 0) {
    throw new Error('此 PNG 使用压缩角色卡元数据，请在制卡工具中导出 JSON 后导入。')
  }
  if (data[separator + 2] !== 0) throw new Error('PNG 角色卡元数据损坏。')
  const languageEnd = data.indexOf(0, separator + 3)
  const translatedEnd = languageEnd >= 0 ? data.indexOf(0, languageEnd + 1) : -1
  if (translatedEnd < 0) throw new Error('PNG 角色卡元数据损坏。')
  return { key, value: data.subarray(translatedEnd + 1) }
}

function parsePng(bytes: Uint8Array): unknown {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('PNG 文件签名错误或文件已损坏。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = new Map<string, Uint8Array>()
  let offset = 8, ended = false
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    if (length > bytes.length - offset - 12) throw new Error('PNG 数据块损坏或文件不完整。')
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (['tEXt', 'iTXt', 'zTXt'].includes(type)) {
      const entry = pngText(type, bytes.subarray(offset + 8, offset + 8 + length))
      if (entry) entries.set(entry.key, entry.value)
    }
    offset += length + 12
    if (type === 'IEND') { ended = length === 0; break }
  }
  if (!ended) throw new Error('PNG 文件损坏，缺少结束数据块。')
  const encoded = entries.get('ccv3') ?? entries.get('chara')
  if (!encoded) throw new Error('PNG 中没有角色卡元数据，请导出角色卡 PNG 或 JSON。')
  if (encoded.length > Math.ceil(JSON_LIMIT * 4 / 3) + 8) throw new Error('角色卡元数据不能超过 2 MiB。')
  let binary: string
  try { binary = atob(decode(encoded).replace(/\s/g, '')) }
  catch { throw new Error('PNG 角色卡元数据不是有效的 Base64。') }
  return json(Uint8Array.from(binary, char => char.charCodeAt(0)))
}

function parseWorldbook(value: unknown): ImportedCard['worldbook'] {
  if (value === undefined || value === null) return []
  const entries = object(value).entries
  if (!Array.isArray(entries)) throw new Error('世界书 entries 必须是列表。')
  if (entries.length > 500) throw new Error('世界书不能超过 500 条，请先在制卡工具中筛选。')
  return entries.map((value, index) => {
    const row = object(value)
    if (row.enabled !== undefined && typeof row.enabled !== 'boolean') throw new Error('世界书启用状态格式错误。')
    return { title: text(row.comment ?? row.name, '世界书标题') || `条目 ${index + 1}`,
      content: text(row.content, '世界书内容'), enabled: row.enabled !== false }
  })
}

export function parseCharacterCard(bytes: Uint8Array, filename: string): ImportedCard {
  if (bytes.length > CARD_FILE_LIMIT) throw new Error('角色卡文件不能超过 10 MiB。')
  const png = /\.png$/i.test(filename) || bytes[0] === 137
  if (!png && !/\.json$/i.test(filename)) throw new Error('请选择 JSON 或角色卡 PNG 文件。')
  const root = object(png ? parsePng(bytes) : json(bytes))
  let format: ImportedCard['format'] = 'V1', data = root
  if (root.spec !== undefined) {
    if (root.spec === 'chara_card_v2') format = 'V2'
    else if (root.spec === 'chara_card_v3') format = 'V3'
    else throw new Error('不支持此角色卡格式，仅支持 V1、V2 和 V3。')
    data = object(root.data)
  }
  const name = text(data.name, '角色名称')
  if (!name) throw new Error('角色卡缺少角色名称。')
  const fields = {} as ImportedCard['fields']
  for (const field of CARD_FIELDS) {
    if (field.key === 'alternate_greetings') {
      const values = data[field.key] ?? []
      if (!Array.isArray(values) || values.some(item => typeof item !== 'string')) throw new Error('其他开场白必须是文本列表。')
      fields[field.key] = values.map(item => item.trim()).filter(Boolean).join('\n\n')
    } else fields[field.key] = text(data[field.key], field.label)
  }
  const worldbook = parseWorldbook(data.character_book)
  const warnings: string[] = []
  if (data.extensions && Object.keys(object(data.extensions)).length) warnings.push('扩展配置、正则和脚本不执行；仅应用勾选的文本。')
  if (Array.isArray(data.assets) && data.assets.length) warnings.push('头像、音频等资源附件不会导入或下载。')
  if (Array.isArray(data.group_only_greetings) && data.group_only_greetings.length) warnings.push('群聊专用开场未导入；如需保留，请整理到示例对话中。')
  const content = [...Object.values(fields), ...worldbook.map(row => row.content)].join('\n')
  if (/<(?!START>)[^<>]+>|<%|{{\s*(?!(?:char|user)\s*}})[^{}]+}}/i.test(content)) {
    warnings.push('包含 HTML 或其他模板语法，将按普通文本保留，请在预览中检查。')
  }
  return { name, format, fields, worldbook, warnings,
    creator: text(data.creator, '创作者'), version: text(data.character_version, '角色版本') }
}

export function compileCharacterCard(card: ImportedCard, selected: { name: string; fields: readonly CardField[]; worldbook: readonly number[] }): { name: string; persona: string } {
  const name = selected.name.normalize('NFKC').trim()
  if (!name || personaLength(name) > 32 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('人格名称须为 1–32 个可见字符。')
  const replace = (value: string) => value.replace(/{{\s*char\s*}}/gi, () => name).replace(/{{\s*user\s*}}/gi, '当前发言者')
  const sections = CARD_FIELDS.filter(field => selected.fields.includes(field.key) && card.fields[field.key])
    .map(field => `【${field.label}】\n${replace(card.fields[field.key])}`)
  card.worldbook.forEach((entry, index) => {
    if (selected.worldbook.includes(index) && entry.enabled && entry.content) sections.push(`【世界观：${entry.title}】\n${replace(entry.content)}`)
  })
  if (!sections.length) throw new Error('请至少选择一项有内容的设定或世界书条目。')
  const persona = `【角色】\n${name}\n\n${sections.join('\n\n')}`
  if (personaLength(persona) > 12000) throw new Error(`合成人格 ${personaLength(persona).toLocaleString()} 字符，超过 12,000 字符；请减少选项或先精简角色卡。`)
  return { name, persona }
}
