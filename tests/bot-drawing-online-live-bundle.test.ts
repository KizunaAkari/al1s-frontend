import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const baseline = path.resolve('../artifacts/qq-close-compact-20261109-01a1/frontend/assets/BotManagement-close-compact-20261109-01a1.js')
const candidate = path.resolve('../artifacts/qq-online-drawing-20261109-8702401b/frontend/assets/BotManagement-online-drawing-20261109.js')
const hasLocalBundles = [baseline, candidate].every(file => fs.existsSync(file))
const before = hasLocalBundles ? fs.readFileSync(baseline, 'utf8') : ''
const after = hasLocalBundles ? fs.readFileSync(candidate, 'utf8') : ''

function drawingSpan(source: string): [number, number] {
  const tree = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true)
  let result: [number, number] | undefined
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'wb' && node.initializer)
      result = [node.initializer.getStart(tree), node.initializer.end]
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!result) throw new Error('drawing component missing')
  return result
}

it.skipIf(!hasLocalBundles)('changes only the drawing component in the live bundle and evaluates in order', () => {
  const mask = (source: string) => {
    const [start, end] = drawingSpan(source)
    return source.slice(0, start) + '__drawing__' + source.slice(end)
  }
  expect(mask(after)).toBe(mask(before))
  const tree = ts.createSourceFile('bundle.js', after, ts.ScriptTarget.Latest, true)
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
  let executable = after
  for (const [start, end, value] of edits.sort((a,b) => b[0] - a[0])) executable = executable.slice(0,start) + value + executable.slice(end)
  const stub: unknown = new Proxy(() => stub, { get: () => stub, apply: () => stub })
  expect(() => new Function('stub', executable)(stub)).not.toThrow()
})

it.skipIf(!hasLocalBundles)('opens and saves an online preset through the patched live component', async () => {
  const settings = {enabled:true,keep_drawing_warm:false,allow_private:false,event_ws_url:'ws://bot:3001',
    comfy_base_url:'http://host.docker.internal:8188',groups:[],default_text_preset_id:null,
    default_edit_preset_id:null,default_online_preset_id:null,row_version:1,applied_version:1}
  const request = vi.fn().mockResolvedValue({data:{id:'online',number:6,revision:1,row_version:1}})
  const get = vi.fn().mockImplementation(async (url:string) => {
    if (url.endsWith('/prompt-models')) return {data:{items:[],active_id:null,selection_version:1}}
    if (url.endsWith('/tasks')) return {data:{items:[],next_after_id:null}}
    return {data:{}}
  })
  const bindings: Record<string, unknown> = {
    xe:Vue.defineComponent, be:Vue.renderList, pe:Vue.Fragment, l:Vue.openBlock, s:Vue.createElementBlock,
    u:Vue.toDisplayString, e:Vue.createElementVNode, I:Vue.createCommentVNode, se:Vue.unref, ie:Vue.createVNode,
    oe:Vue.vModelText, T:Vue.withDirectives, B:Vue.createTextVNode, Ce:Vue.vModelSelect, _e:Vue.vShow,
    ke:Vue.createBlock, Fe:Vue.vModelCheckbox, we:Vue.normalizeClass, tt:Vue.createStaticVNode,
    ft:Vue.withModifiers, pt:Vue.withKeys, le:Vue.computed, Be:Vue.onBeforeUnmount, Re:Vue.onMounted,
    b:Vue.ref, ge:Vue.watch, Uf:Vue.defineComponent({render:()=>null}), Me:()=>{}, rf:vi.fn(), af:vi.fn(),
    Yp:vi.fn().mockResolvedValue([]), ct:vi.fn().mockResolvedValue([]),
    ht:vi.fn().mockResolvedValue({state:'unavailable',media_used_bytes:0,media_limit_bytes:1024}),
    vt:vi.fn().mockResolvedValue(settings), of:vi.fn(), nf:vi.fn(), sf:vi.fn(), uf:vi.fn(), ef:vi.fn(), Zp:vi.fn(),
    ce:{get,request,post:vi.fn(),put:vi.fn(),delete:vi.fn()},
    Te:(id:string,suffix:string)=>`/bots/ai/drawing/${id}/${suffix}`,
    lt:(version:number,key:string)=>({'If-Match':String(version),'Idempotency-Key':key}),
  }
  const [start,end] = drawingSpan(after)
  const component = new Function(...Object.keys(bindings), `return (${after.slice(start,end)})`)(...Object.values(bindings))
  const page = mount(component,{props:{serviceId:'qq',active:true}})
  await flushPromises()
  await page.get('[data-drawing-tab="workflows"]').trigger('click')
  await page.findAll('button').find(button => button.text() === '新增线上预设')!.trigger('click')
  await page.get('[data-online-field="name"]').setValue('线上测试')
  await page.get('[data-online-field="model"]').setValue('gpt-image-2.6-sunburst')
  await page.get('[data-online-field="secret"]').setValue('example-test-value')
  await page.get('form').trigger('submit')
  await flushPromises()
  expect(request).toHaveBeenCalledWith(expect.objectContaining({method:'POST',url:'/bots/ai/drawing/qq/online-presets',
    data:expect.objectContaining({name:'线上测试',model_id:'gpt-image-2.6-sunburst'})}))
  page.unmount()
})
