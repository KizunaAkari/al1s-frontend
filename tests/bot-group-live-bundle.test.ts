import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const file = path.resolve('../artifacts/qq-ai-group-settings/patch-layout/assets/BotManagement-group-layout-20261105.js')
const hasLocalBundles = [file, path.resolve('../artifacts/qq-drawing-explicit-20261105/platform/assets/BotManagement-explicit-draw-20261105.js')].every(file => fs.existsSync(file))
const text = hasLocalBundles ? fs.readFileSync(file, 'utf8') : ''
const tree = ts.createSourceFile('live.js', text, ts.ScriptTarget.Latest, true)
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
const vueBindings = { xe:Vue.defineComponent, be:Vue.renderList, pe:Vue.Fragment, l:Vue.openBlock,
  s:Vue.createElementBlock, u:Vue.toDisplayString, e:Vue.createElementVNode, I:Vue.createCommentVNode,
  se:Vue.unref, ie:Vue.createVNode, oe:Vue.vModelText, T:Vue.withDirectives, B:Vue.createTextVNode,
  Ce:Vue.vModelSelect, _e:Vue.vShow, ke:Vue.createBlock, Fe:Vue.vModelCheckbox, we:Vue.normalizeClass,
  tt:Vue.createStaticVNode, ft:Vue.withModifiers, pt:Vue.withKeys, le:Vue.computed, Be:Vue.onBeforeUnmount,
  Re:Vue.onMounted, b:Vue.ref, ge:Vue.watch }
function evaluate(name: string, values: Record<string, unknown>) {
  const bindings = {...vueBindings, ...values}
  return new Function(...Object.keys(bindings), `return (${initializer(name)})`)(...Object.values(bindings))
}

it.skipIf(!hasLocalBundles)('evaluates the whole patched live bundle in declaration order', () => {
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

it.skipIf(!hasLocalBundles)('preserves every part of the live bundle outside the three components and group API', () => {
  const oldFile = path.resolve('../artifacts/qq-drawing-explicit-20261105/platform/assets/BotManagement-explicit-draw-20261105.js')
  function mask(source: string) {
    const parsed = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true)
    const edits: [number, number, string][] = []
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.initializer && ['Rl','Wp','wb','ef'].includes(node.name.getText(parsed)))
        edits.push([node.initializer.getStart(parsed), node.initializer.end, `__${node.name.getText(parsed)}__`])
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    expect(edits).toHaveLength(4)
    for (const [start,end,replacement] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0,start)+replacement+source.slice(end)
    return source
  }
  expect(mask(text)).toBe(mask(fs.readFileSync(oldFile,'utf8')))
})

it.skipIf(!hasLocalBundles)('routes the real group widgets and sends the full drawing scope payload', async () => {
  const empty = Vue.defineComponent({render:() => null})
  const switchRow = Vue.defineComponent({props:['modelValue'],emits:['update:modelValue'],
    setup(props,{emit,attrs}) { return () => Vue.h('input',{...attrs,type:'checkbox',checked:props.modelValue,
      onChange:(event:Event) => emit('update:modelValue',(event.target as HTMLInputElement).checked)}) }})
  const groupWidget = evaluate('Rl', {})
  const ai = {service_id:'qq',enabled:true,event_ws_url:'ws://llbot:3001',allow_private:false,groups:['100','200'],
    reply_all_groups:['200'],smart_reply_groups:[],wake_words:[],persona:'',vision_enabled:false,stt_enabled:false,
    tts_mode:'off',desired_version:3,applied_version:3,providers:{chat:{adapter_kind:'openai_chat_completion',
      model_id:'test',base_url:'',voice:'',secret_configured:true}}}
  const saveAi = vi.fn().mockImplementation(async (_id,value) => ({...ai,...value}))
  const chat = evaluate('Wp', {Ke:empty,Kv:empty,Ve:switchRow,it:groupWidget,qc:empty,Tc:empty,
    Me:()=>{},bt:()=>'',_v:vi.fn(),yv:vi.fn().mockResolvedValue({items:[]}),fv:vi.fn().mockResolvedValue(ai),
    mv:vi.fn().mockResolvedValue({state:'idle',desired_version:3,applied_version:3,connected:true}),bv:saveAi,gv:vi.fn()})
  const chatPage = mount(chat,{props:{serviceId:'qq'}}); await flushPromises()
  await chatPage.get('[data-ai-configure-group="200"]').trigger('click')
  expect((chatPage.get('[data-ai-group-select]').element as HTMLSelectElement).value).toBe('200')
  await chatPage.get('[data-group-mode="200-smart"]').setValue(true)
  await chatPage.get('[data-action="save-ai-settings"]').trigger('click'); await flushPromises()
  expect(saveAi).toHaveBeenCalledWith('qq',expect.objectContaining({smart_reply_groups:['200']}),3,expect.any(String))
  chatPage.unmount()

  const group = {group_id:'200',mode:'r18',row_version:2,restrict_workflows:true,allowed_preset_ids:['a']}
  const put = vi.fn().mockResolvedValue({data:{...group,mode:'green',row_version:3,allowed_preset_ids:['a','b']}})
  const saveGroup = evaluate('ef',{ce:{put},Te:(id:string,suffix:string)=>`/bots/ai/drawing/${id}/${suffix}`,
    lt:(version:number,key:string)=>({'If-Match':String(version),'Idempotency-Key':key})})
  const drawing = evaluate('wb',{Me:()=>{},Ve:switchRow,Uf:empty,rf:vi.fn(),af:vi.fn(),Yp:vi.fn().mockResolvedValue([group]),
    ct:vi.fn().mockResolvedValue([{id:'a',number:1,name:'A',kind:'txt2img',enabled:true,validation_state:'ready',lora_keys:[]},
      {id:'b',number:2,name:'B',kind:'image_edit',enabled:true,validation_state:'ready',lora_keys:[]}]),
    ht:vi.fn().mockResolvedValue({state:'available',drawing_resources:0}),vt:vi.fn().mockResolvedValue({enabled:true,
      keep_drawing_warm:false,default_text_preset_id:null,default_edit_preset_id:null,row_version:1,applied_version:1}),
    qt:vi.fn().mockResolvedValue({items:[]}),of:vi.fn(),nf:vi.fn(),sf:vi.fn(),uf:vi.fn(),ef:saveGroup,Zp:vi.fn()})
  const drawPage = mount(drawing,{props:{serviceId:'qq',active:true}}); await flushPromises()
  await drawPage.get('[data-drawing-configure-group="200"]').trigger('click')
  await drawPage.get('[data-drawing-allowed="b"]').setValue(true)
  await drawPage.get('[data-drawing-r18-check]').setValue(true)
  await drawPage.get('[data-drawing-save-group="200"]').trigger('click'); await flushPromises()
  expect(put).toHaveBeenCalledWith('/bots/ai/drawing/qq/group-modes/200',
    {mode:'green',restrict_workflows:true,allowed_preset_ids:['a','b']},expect.objectContaining({headers:expect.any(Object)}))
  drawPage.unmount()
})
