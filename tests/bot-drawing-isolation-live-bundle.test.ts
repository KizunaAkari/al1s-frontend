import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const root = path.resolve('../artifacts/qq-ai-drawing-isolation/patch/assets')
const hasLocalBundles = [path.join(root, 'BotManagement-drawing-isolation-20261105.js'), path.resolve('../artifacts/qq-ai-group-settings/patch-layout/assets/BotManagement-group-layout-20261105.js')].every(file => fs.existsSync(file))
const text = hasLocalBundles ? fs.readFileSync(path.join(root, 'BotManagement-drawing-isolation-20261105.js'), 'utf8') : ''
const tree = ts.createSourceFile('bundle.js', text, ts.ScriptTarget.Latest, true)
function initializer(name: string) {
  let result = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer)
      result = node.initializer.getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!result) throw new Error(`missing ${name}`)
  return result
}

it.skipIf(!hasLocalBundles)('evaluates the full live candidate in declaration order', () => {
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
  for (const [start,end,replacement] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0,start)+replacement+source.slice(end)
  const stub: unknown = new Proxy(() => stub, { get: () => stub, apply: () => stub })
  expect(() => new Function('stub', source)(stub)).not.toThrow()
})

it.skipIf(!hasLocalBundles)('leaves all other live bundle code unchanged', () => {
  const old = fs.readFileSync(path.resolve('../artifacts/qq-ai-group-settings/patch-layout/assets/BotManagement-group-layout-20261105.js'), 'utf8')
  function mask(source: string) {
    const parsed = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true)
    let span: [number,number] | undefined
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'wb' && node.initializer)
        span = [node.initializer.getStart(parsed), node.initializer.end]
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    if (!span) throw new Error('drawing component missing')
    return source.slice(0,span[0]) + '__drawing__' + source.slice(span[1])
  }
  expect(mask(text)).toBe(mask(old))
})

it.skipIf(!hasLocalBundles)('renders and saves independent scopes and model in the patched live component', async () => {
  const switches = Vue.defineComponent({props:['modelValue'],emits:['update:modelValue'],
    setup(props,{emit,attrs}) { return () => Vue.h('input',{...attrs,type:'checkbox',checked:props.modelValue,
      onChange:(event:Event) => emit('update:modelValue',(event.target as HTMLInputElement).checked)}) }})
  const empty = Vue.defineComponent({render:() => null})
  const settings = {enabled:true,keep_drawing_warm:false,allow_private:false,event_ws_url:'ws://bot:3001',
    comfy_base_url:'http://host.docker.internal:8188',groups:['123'],default_text_preset_id:null,
    default_edit_preset_id:null,row_version:1,applied_version:1}
  const saveSettings = vi.fn().mockResolvedValue({row_version:2})
  const get = vi.fn().mockResolvedValue({data:{provider:null}})
  const put = vi.fn().mockImplementation(async (_path,value) => ({data:{...value,secret_input:undefined,
    row_version:2,secret_configured:true}}))
  const bindings: Record<string, unknown> = {
    xe:Vue.defineComponent, be:Vue.renderList, pe:Vue.Fragment, l:Vue.openBlock, s:Vue.createElementBlock,
    u:Vue.toDisplayString, e:Vue.createElementVNode, I:Vue.createCommentVNode, se:Vue.unref, ie:Vue.createVNode,
    oe:Vue.vModelText, T:Vue.withDirectives, B:Vue.createTextVNode, Ce:Vue.vModelSelect, _e:Vue.vShow,
    ke:Vue.createBlock, Fe:Vue.vModelCheckbox, we:Vue.normalizeClass, tt:Vue.createStaticVNode,
    ft:Vue.withModifiers, pt:Vue.withKeys, le:Vue.computed, Be:Vue.onBeforeUnmount, Re:Vue.onMounted,
    b:Vue.ref, ge:Vue.watch, Ve:switches, Uf:empty, Me:()=>{}, rf:vi.fn(), af:vi.fn(),
    Yp:vi.fn().mockResolvedValue([{group_id:'123',mode:'green',row_version:0,restrict_workflows:false,allowed_preset_ids:[]}]),
    ct:vi.fn().mockResolvedValue([]), ht:vi.fn().mockResolvedValue({state:'available',drawing_resources:0}),
    vt:vi.fn().mockResolvedValue(settings), qt:vi.fn().mockResolvedValue({items:[]}), of:vi.fn(), nf:vi.fn(),
    sf:vi.fn(), uf:vi.fn(), ef:vi.fn(), Zp:saveSettings, ce:{get,put},
    Te:(id:string,suffix:string)=>`/bots/ai/drawing/${id}/${suffix}`,
    lt:(version:number,key:string)=>({'If-Match':String(version),'Idempotency-Key':key}),
  }
  const component = new Function(...Object.keys(bindings), `return (${initializer('wb')})`)(...Object.values(bindings))
  const page = mount(component,{props:{serviceId:'qq',active:true}}); await flushPromises()
  await page.get('[data-drawing-field="allow-private"]').setValue(true)
  await page.get('[data-drawing-field="groups"]').setValue('123\n456')
  await page.get('[data-drawing-action="save-settings"]').trigger('click'); await flushPromises()
  expect(saveSettings).toHaveBeenCalledWith('qq',expect.objectContaining({allow_private:true,groups:['123','456']}),1,expect.any(String))
  await page.get('[data-drawing-model="id"]').setValue('draw-model')
  await page.get('[data-drawing-model="secret"]').setValue('secret')
  await page.get('[data-drawing-action="save-model"]').trigger('click'); await flushPromises()
  expect(put).toHaveBeenCalledWith('/bots/ai/drawing/qq/prompt-provider',
    expect.objectContaining({model_id:'draw-model',secret_input:'secret'}), expect.objectContaining({headers:expect.any(Object)}))
  expect((page.get('[data-drawing-model="secret"]').element as HTMLInputElement).value).toBe('')
  page.unmount()
})
