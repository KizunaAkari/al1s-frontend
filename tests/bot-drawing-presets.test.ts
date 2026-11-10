import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }))
vi.mock('../src/shared/api/bot-drawing', () => ({ fetchDrawingPreset: api.fetch, saveDrawingPreset: api.save }))
import AiDrawingPresetEditor from '../src/modules/bots/drawing/AiDrawingPresetEditor.vue'

const graph = {
  '1': { class_type: 'CLIPTextEncode', inputs: { text: '固定正面词' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: '固定负面词' } },
  '3': { class_type: 'KSampler', inputs: { seed: 1 } },
  '4': { class_type: 'LoraLoader', inputs: { lora_name: 'character.safetensors' } },
  '5': { class_type: 'SaveImage', inputs: { filename_prefix: 'original' } },
}

beforeEach(() => { vi.clearAllMocks(); api.save.mockResolvedValue({ id: 'preset', number: 1, revision: 1, row_version: 1 }) })

it('maps API nodes, preserves fixed conditions and selects a configured LoRA alias', async () => {
  const page = mount(AiDrawingPresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  await page.get('[data-field="preset-name"]').setValue('动漫')
  await page.get('[data-field="workflow-json"]').setValue(JSON.stringify(graph))
  await page.get('[data-field="positive-binding"]').setValue('1:text')
  await page.get('[data-field="negative-binding"]').setValue('2:text')
  await page.get('[data-field="seed-binding"]').setValue('3:seed')
  await page.get('[data-field="output-binding"]').setValue('5')
  await page.get('[data-field="lora-aliases"]').setValue('角色A=character.safetensors')
  await page.get('[data-action="save-preset"]').trigger('click')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', null, expect.objectContaining({
    name: '动漫', kind: 'txt2img', aliases: { '角色A': 'character.safetensors' },
    bindings: expect.objectContaining({ positive_prefix: '固定正面词', negative_prefix: '固定负面词',
      positive: { node_id: '1', input_name: 'text' }, negative: { node_id: '2', input_name: 'text' } }),
  }), 0, expect.any(String))
})

it('rejects canvas-format JSON and aliases that do not belong to the workflow', async () => {
  const page = mount(AiDrawingPresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  await page.get('[data-field="preset-name"]').setValue('动漫')
  await page.get('[data-field="workflow-json"]').setValue('{"nodes": [], "links": []}')
  await page.get('[data-action="save-preset"]').trigger('click')
  expect(page.text()).toContain('API 格式')
  expect(api.save).not.toHaveBeenCalled()
})

it('recognizes MOSS model-only LoRA nodes when saving aliases', async () => {
  const page = mount(AiDrawingPresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  const mossGraph = { ...graph, '4': { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'moss-style.safetensors' } } }
  await page.get('[data-field="preset-name"]').setValue('MOSS')
  await page.get('[data-field="workflow-json"]').setValue(JSON.stringify(mossGraph))
  await page.get('[data-field="positive-binding"]').setValue('1:text')
  await page.get('[data-field="output-binding"]').setValue('5')
  await page.get('[data-field="lora-aliases"]').setValue('风格=moss-style.safetensors')
  expect(page.text()).toContain('moss-style.safetensors')
  await page.get('[data-action="save-preset"]').trigger('click')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', null, expect.objectContaining({
    aliases: { '风格': 'moss-style.safetensors' },
  }), 0, expect.any(String))
})

it('maps Qwen 2.1 edit prompt and negative prompt separately', async () => {
  const page = mount(AiDrawingPresetEditor, { props: { serviceId: 'qq', presetId: null, open: true } })
  const editGraph = {
    '1': { class_type: 'TextEncodeQwenImage21', inputs: { prompt: '保留人物', negative_prompt: '模糊' } },
    '2': { class_type: 'ImageReceiver', inputs: { image_data: '' } },
    '3': { class_type: 'KSampler', inputs: { seed: 1 } },
    '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'original' } },
  }
  await page.get('[data-field="preset-name"]').setValue('Qwen 图生图')
  await page.get('[data-field="preset-kind"]').setValue('image_edit')
  await page.get('[data-field="workflow-json"]').setValue(JSON.stringify(editGraph))
  const positiveValues = page.findAll('[data-field="positive-binding"] option').map(option => option.attributes('value'))
  const negativeValues = page.findAll('[data-field="negative-binding"] option').map(option => option.attributes('value'))
  expect(positiveValues).toContain('1:prompt')
  expect(positiveValues).not.toContain('1:negative_prompt')
  expect(negativeValues).toContain('1:negative_prompt')
  expect(negativeValues).not.toContain('1:prompt')
  await page.get('[data-field="positive-binding"]').setValue('1:prompt')
  await page.get('[data-field="negative-binding"]').setValue('1:negative_prompt')
  await page.get('[data-field="image-binding"]').setValue('2:image_data')
  await page.get('[data-field="output-binding"]').setValue('4')
  await page.get('[data-action="save-preset"]').trigger('click')
  await flushPromises()
  expect(api.save).toHaveBeenCalledWith('qq', null, expect.objectContaining({ bindings: expect.objectContaining({
    positive: { node_id: '1', input_name: 'prompt' }, negative: { node_id: '1', input_name: 'negative_prompt' },
    positive_prefix: '保留人物', negative_prefix: '模糊', image: { node_id: '2', input_name: 'image_data' },
  }) }), 0, expect.any(String))
})
