import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'

const hasLocalBundles = [
  '../artifacts/comfy-redesign/frontend-safe-r4/assets/BotManagement-DM6eQibM.js',
  '../artifacts/qq-drawing-explicit-20261105/platform/assets/BotManagement-explicit-draw-20261105.js',
].every(file => fs.existsSync(path.resolve(file)))

it.skipIf(!hasLocalBundles)('evaluates the complete patched bundle in its real declaration order', () => {
  const file = path.resolve('../artifacts/comfy-redesign/frontend-safe-r4/assets/BotManagement-DM6eQibM.js')
  const text = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile('live.js', text, ts.ScriptTarget.Latest, true)
  const edits: [number, number, string][] = []
  for (const node of tree.statements) {
    if (ts.isImportDeclaration(node)) {
      const names: string[] = []
      if (node.importClause?.name) names.push(node.importClause.name.text)
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map(item => item.name.text))
      if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text)
      edits.push([node.getStart(tree), node.end, names.map(name => `const ${name}=stub;`).join('')])
    } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      edits.push([node.getStart(tree), node.end, ''])
    }
  }
  let source = text
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + replacement + source.slice(end)
  }
  const stub: unknown = new Proxy(() => stub, { get: () => stub, apply: () => stub })
  expect(() => new Function('stub', source)(stub)).not.toThrow()
})

it.skipIf(!hasLocalBundles)('runs the patched live vision component with the existing Vue and API bindings', async () => {
  const file = path.resolve('../artifacts/comfy-redesign/frontend-safe-r4/assets/BotManagement-DM6eQibM.js')
  const text = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile('live.js', text, ts.ScriptTarget.Latest, true)
  let initializer = ''
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'Tc' && node.initializer) {
      initializer = node.initializer.getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  expect(initializer).toContain('LocalVisionControl')
  expect(text).toContain('serviceId:o.serviceId??void 0,visionEnabled:f.value?.vision_enabled??false')
  expect(text).not.toContain('data-drawing-field":"keep-warm"')
  const api = { get: vi.fn().mockResolvedValue({ data: { state: 'running' } }) }
  const resources = vi.fn().mockResolvedValue({ state: 'available', vision_state: 'warm' })
  const bindings = { xe: Vue.defineComponent, b: Vue.ref, le: Vue.computed, Re: Vue.onMounted,
    Be: Vue.onBeforeUnmount, ge: Vue.watch, l: Vue.openBlock, s: Vue.createElementBlock,
    e: Vue.createElementVNode, B: Vue.createTextVNode, I: Vue.createCommentVNode,
    we: Vue.normalizeClass, u: Vue.toDisplayString, ce: api, ht: resources }
  const { ht: lateResource, ...early } = bindings
  const component = new Function(...Object.keys(early), 'lateResource',
    `const result = (${initializer}); const ht = lateResource; return result`)(...Object.values(early), lateResource)
  const view = mount(component, { props: { serviceId: 'qq', visionEnabled: true } })
  await flushPromises()
  expect(view.text()).toContain('共享 ComfyUI 服务：运行中')
  expect(view.text()).toContain('图片理解模型：已预热')
  expect(resources).toHaveBeenCalledWith('qq')
  view.unmount()
})

it.skipIf(!hasLocalBundles)('evaluates the live bundle after updating drawing help text', () => {
  const file = path.resolve('../artifacts/qq-drawing-explicit-20261105/platform/assets/BotManagement-explicit-draw-20261105.js')
  const text = fs.readFileSync(file, 'utf8')
  expect(text).toContain('/wfN 画面描述')
  expect(text).toContain('普通聊天不会触发绘图')
  const tree = ts.createSourceFile('live.js', text, ts.ScriptTarget.Latest, true)
  const edits: [number, number, string][] = []
  for (const node of tree.statements) {
    if (ts.isImportDeclaration(node)) {
      const names: string[] = []
      if (node.importClause?.name) names.push(node.importClause.name.text)
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map(item => item.name.text))
      if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text)
      edits.push([node.getStart(tree), node.end, names.map(name => `const ${name}=stub;`).join('')])
    } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      edits.push([node.getStart(tree), node.end, ''])
    }
  }
  let source = text
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + replacement + source.slice(end)
  }
  const stub: unknown = new Proxy(() => stub, { get: () => stub, apply: () => stub })
  expect(() => new Function('stub', source)(stub)).not.toThrow()
})
