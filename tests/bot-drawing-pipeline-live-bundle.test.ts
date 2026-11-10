import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const root = path.resolve('../artifacts/qq-drawing-pipeline-01a1bbef/frontend/assets')
const hasLocalBundles = [path.join(root, 'BotManagement-drawing-pipeline-20261109.js'), path.join(root, 'drawing-pipeline-20261109.css'), path.resolve('../artifacts/qq-ai-drawing-isolation/patch/assets/BotManagement-drawing-isolation-20261105.js')].every(file => fs.existsSync(file))
const text = hasLocalBundles ? fs.readFileSync(path.join(root, 'BotManagement-drawing-pipeline-20261109.js'), 'utf8') : ''
const tree = ts.createSourceFile('bundle.js', text, ts.ScriptTarget.Latest, true)

function drawingSpan(source: string): [number, number] {
  const parsed = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true)
  let span: [number, number] | undefined
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'wb' && node.initializer)
      span = [node.initializer.getStart(parsed), node.initializer.end]
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  if (!span) throw new Error('drawing component missing')
  return span
}

it.skipIf(!hasLocalBundles)('preserves all other live code and evaluates the candidate in declaration order', () => {
  const old = fs.readFileSync(path.resolve('../artifacts/qq-ai-drawing-isolation/patch/assets/BotManagement-drawing-isolation-20261105.js'), 'utf8')
  function mask(source: string) {
    const [start, end] = drawingSpan(source)
    return source.slice(0, start) + '__drawing__' + source.slice(end)
  }
  expect(mask(text)).toBe(mask(old))
  const edits: [number, number, string][] = []
  for (const node of tree.statements) {
    if (ts.isImportDeclaration(node)) {
      const names: string[] = []
      if (node.importClause?.name) names.push(node.importClause.name.text)
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map(item => item.name.text))
      if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text)
      edits.push([node.getStart(tree), node.end, names.map(name => `const ${name}=stub;`).join('')])
    } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) edits.push([node.getStart(tree), node.end, ''])
  }
  let source = text
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + replacement + source.slice(end)
  const stub: unknown = new Proxy(() => stub, { get: () => stub, apply: () => stub })
  expect(() => new Function('stub', source)(stub)).not.toThrow()
  expect(fs.readFileSync(path.join(root, 'drawing-pipeline-20261109.css'), 'utf8')).toContain('#ai-panel-access.ai-top-grid { grid-template-columns: minmax(0, 1fr); }')
})

it.skipIf(!hasLocalBundles)('renders the patched component and calls the new model and queue routes', async () => {
  const settings = {enabled:true,keep_drawing_warm:false,allow_private:false,event_ws_url:'ws://bot:3001',
    comfy_base_url:'http://host.docker.internal:8188',groups:['123'],default_text_preset_id:null,
    default_edit_preset_id:null,row_version:1,applied_version:1}
  const item = {id:'task-1',operation:'draw',origin:'qq',generation_status:'running',audit_status:'pending',
    send_status:'none',cleanup_status:'none',error_code:null,created_at:'2026-11-09',processing_stage:'executing',
    cancel_requested:false,deletion_state:'visible',scope_kind:'qq_group',target_id:'123',queue_position:0,
    progress:{node_id:'7',node_name:'KSampler',value:3,max:20,updated_at:'2026-11-09T00:00:00Z'}}
  const profile = {id:'model-1',name:'绘图模型',row_version:1,revision:1,adapter_kind:'openai_chat_completion',
    model_id:'draw-model',base_url:'',network_mode:'direct',secret_configured:true}
  let catalog = {items:[] as typeof profile[],active_id:null as string | null,selection_version:1}
  const get = vi.fn().mockImplementation(async (url:string, config?:{params?:{view?:string}}) => {
    if (url.endsWith('/prompt-models')) return {data:catalog}
    if (url.endsWith('/tasks')) return {data:{items:config?.params?.view === 'active' ? [item] : [],next_after_id:null}}
    return {data:{}}
  })
  const request = vi.fn().mockImplementation(async () => { catalog = {...catalog,items:[profile]}; return {data:profile} })
  const post = vi.fn().mockResolvedValue({data:{state:'success',message:'连接测试通过。'}})
  const bindings: Record<string, unknown> = {
    xe:Vue.defineComponent, be:Vue.renderList, pe:Vue.Fragment, l:Vue.openBlock, s:Vue.createElementBlock,
    u:Vue.toDisplayString, e:Vue.createElementVNode, I:Vue.createCommentVNode, se:Vue.unref, ie:Vue.createVNode,
    oe:Vue.vModelText, T:Vue.withDirectives, B:Vue.createTextVNode, Ce:Vue.vModelSelect, _e:Vue.vShow,
    ke:Vue.createBlock, Fe:Vue.vModelCheckbox, we:Vue.normalizeClass, tt:Vue.createStaticVNode,
    ft:Vue.withModifiers, pt:Vue.withKeys, le:Vue.computed, Be:Vue.onBeforeUnmount, Re:Vue.onMounted,
    b:Vue.ref, ge:Vue.watch, Uf:Vue.defineComponent({render:()=>null}), Me:()=>{}, rf:vi.fn(), af:vi.fn(),
    Yp:vi.fn().mockResolvedValue([]), ct:vi.fn().mockResolvedValue([]),
    ht:vi.fn().mockResolvedValue({state:'available',media_used_bytes:0,media_limit_bytes:1024}),
    vt:vi.fn().mockResolvedValue(settings), of:vi.fn(), nf:vi.fn(), sf:vi.fn(), uf:vi.fn(), ef:vi.fn(), Zp:vi.fn(),
    ce:{get,request,post,put:vi.fn(),delete:vi.fn()},
    Te:(id:string,suffix:string)=>`/bots/ai/drawing/${id}/${suffix}`,
    lt:(version:number,key:string)=>({'If-Match':String(version),'Idempotency-Key':key}),
  }
  const [start,end] = drawingSpan(text)
  const component = new Function(...Object.keys(bindings), `return (${text.slice(start,end)})`)(...Object.values(bindings))
  const page = mount(component,{props:{serviceId:'qq',active:true}})
  await flushPromises()
  expect(page.text()).toContain('通用设置')
  await page.get('[data-drawing-action="open-models"]').trigger('click')
  await page.get('[data-drawing-model="name"]').setValue('绘图模型')
  await page.get('[data-drawing-model="id"]').setValue('draw-model')
  await page.get('[data-drawing-model="secret"]').setValue('synthetic-secret')
  await page.get('form.drawing-model-form').trigger('submit')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(expect.objectContaining({method:'POST',url:'/bots/ai/drawing/qq/prompt-models',
    data:expect.objectContaining({name:'绘图模型',model_id:'draw-model'})}))
  await page.findAll('button').find(button => button.text() === '测试连接')!.trigger('click')
  await flushPromises()
  expect(post).toHaveBeenCalledWith('/bots/ai/drawing/qq/prompt-models/model-1/test',{},expect.any(Object))
  await page.get('[aria-label="关闭"]').trigger('click')
  await page.get('[data-drawing-tab="tasks"]').trigger('click')
  expect(page.text()).toContain('节点 #7 · KSampler · 3 / 20')
  expect(get).toHaveBeenCalledWith('/bots/ai/drawing/qq/tasks',expect.objectContaining({params:{view:'active'}}))
  page.unmount()
})
