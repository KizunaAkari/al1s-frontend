import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ manage:vi.fn(), preview:vi.fn(), upload:vi.fn() }))
vi.mock('../src/shared/api/bot-ai', () => ({
  manageAiSticker:api.manage, previewAiSticker:api.preview, importAiStickers:api.upload,
}))
import AiStickerLibrary from '../src/modules/bots/ai/AiStickerLibrary.vue'

const image = {id:'a'.repeat(64),group_id:'100',category:'happy',category_label:'开心',
  description:'旧描述',overlay_text:'',tags:['开心'],scenes:['打招呼'],scene_count:1,uses:0,enabled:true}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('URL', {...URL, createObjectURL:vi.fn(()=>'blob:fixture'),revokeObjectURL:vi.fn()})
  api.preview.mockResolvedValue(new Blob(['gif']))
  api.manage.mockImplementation(async (_id, data) => data.action === 'detail'
    ? {status:'ready',item:image}
    : data.action === 'list'
      ? {status:'ready',total:1,library_total:1,capacity:500,pending:0,
         categories:[{key:'happy',name:'开心'}],items:[image]}
      : {status:'ok'})
})

it('loads a group-scoped library and saves image metadata', async () => {
  const page = mount(AiStickerLibrary, {props:{serviceId:'qq',groups:['100'],enabled:true,synchronized:true,blocked:false}})
  await flushPromises()
  expect(page.text()).toContain('本群 1 张')
  await page.get('[data-action="edit-sticker"]').trigger('click')
  await flushPromises()
  await page.get('[data-field="sticker-description"]').setValue('新描述')
  await page.get('[data-action="save-sticker"]').trigger('click')
  await flushPromises()
  expect(api.manage).toHaveBeenCalledWith('qq', expect.objectContaining({action:'edit',group_id:'100',
    image_id:image.id,description:'新描述',category:'happy'}))
  page.unmount()
})

it('continues a large import from the returned offset for the selected group', async () => {
  api.upload.mockResolvedValueOnce({status:'continue',queued:1,total:2,next_offset:1})
    .mockResolvedValueOnce({status:'complete',queued:1,total:2,next_offset:null})
  const page = mount(AiStickerLibrary, {props:{serviceId:'qq',groups:['100'],enabled:true,synchronized:true,blocked:false}})
  await flushPromises()
  const file = new File(['fixture'], 'stickers.zip', {type:'application/zip'})
  const input = page.get('[data-field="sticker-files"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', {value:[file],configurable:true})
  await page.get('[data-field="sticker-files"]').trigger('change')
  await page.get('[data-action="import-stickers"]').trigger('click')
  await flushPromises()
  expect(api.upload).toHaveBeenNthCalledWith(1,'qq','100',0,file)
  expect(api.upload).toHaveBeenNthCalledWith(2,'qq','100',1,file)
  expect(page.text()).toContain('已排队 2')
  page.unmount()
})

it('resumes after a busy queue at the first item not yet accepted', async () => {
  api.upload.mockResolvedValueOnce({status:'busy',queued:1,total:2,next_offset:1})
    .mockResolvedValueOnce({status:'complete',queued:1,total:2,next_offset:null})
  const page = mount(AiStickerLibrary, {props:{serviceId:'qq',groups:['100'],enabled:true,synchronized:true,blocked:false}})
  await flushPromises()
  const file = new File(['fixture'], 'stickers.zip', {type:'application/zip'})
  const input = page.get('[data-field="sticker-files"]').element as HTMLInputElement
  Object.defineProperty(input, 'files', {value:[file],configurable:true})
  await page.get('[data-field="sticker-files"]').trigger('change')
  await page.get('[data-action="import-stickers"]').trigger('click')
  await flushPromises()
  await page.get('[data-action="import-stickers"]').trigger('click')
  await flushPromises()
  expect(api.upload).toHaveBeenNthCalledWith(2,'qq','100',1,file)
  page.unmount()
})
