import { expect,it } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkflowCanvas from '../src/modules/maa/editor/WorkflowCanvas.vue'
import WorkflowMiniMap from '../src/modules/maa/editor/WorkflowMiniMap.vue'
it('creates from searchable context menu, edits inline without opening details, selects right-click target',async()=>{
 const w=mount(WorkflowCanvas,{props:{steps:[{action:'wait',seconds:1},{action:'tap',x:2,y:3}],selected:0,disabled:false,scriptId:'script-1',active:true},attachTo:document.body})
 expect(w.find('.selected-summary').exists()).toBe(false)
 expect(w.findComponent(WorkflowMiniMap).exists()).toBe(true)
 await w.find('.graph-viewport').trigger('contextmenu',{clientX:200,clientY:160})
 const search=document.querySelector<HTMLInputElement>('.graph-menu input')!;search.value='识别';search.dispatchEvent(new Event('input',{bubbles:true}));await w.vm.$nextTick()
 const button=Array.from(document.querySelectorAll<HTMLButtonElement>('.graph-menu button')).find(b=>b.textContent==='识别图形并执行')!;button.click();await w.vm.$nextTick()
 expect(w.emitted('add')?.[0]).toEqual(['recognize_execute'])
 await w.find('[aria-label="等待秒数"]').setValue('5')
 expect(w.emitted('edit')?.[0]).toEqual([0,{action:'wait',seconds:5}])
 await w.findAll('.graph-node')[1]!.trigger('contextmenu',{clientX:300,clientY:200})
 expect(w.emitted('select')?.at(-1)).toEqual([1])
 document.querySelector<HTMLButtonElement>('.graph-menu button')!.click();await w.vm.$nextTick()
 expect(w.emitted('parameters')).toHaveLength(1)
 await w.findAll('.graph-node')[0]!.trigger('keydown',{key:'Enter'})
 expect(w.emitted('parameters')).toHaveLength(2)
 w.unmount()
})
it('disables mutations while busy',async()=>{
 const w=mount(WorkflowCanvas,{props:{steps:[{action:'wait',seconds:1}],selected:0,disabled:true,scriptId:'script-1'},attachTo:document.body})
 expect(w.find('input').attributes('disabled')).toBeDefined()
 await w.find('.graph-viewport').trigger('contextmenu',{clientX:100,clientY:100})
 expect(document.querySelector<HTMLButtonElement>('.graph-menu button')!.disabled).toBe(true)
 w.unmount()
})
it('shows recognition image slot and timing fields inside the node', async () => {
 const w=mount(WorkflowCanvas,{props:{steps:[{action:'wait_click',threshold:0.85,poll_interval_seconds:1,timeout_seconds:20}],selected:0,disabled:false,scriptId:'script-1'},attachTo:document.body})
 expect(w.find('.selected-summary').exists()).toBe(false)
 expect(w.find('.node-image').text()).toContain('未绑定识别图片')
 await w.find('[aria-label="步骤超时秒数"]').setValue('25')
 expect(w.emitted('edit')?.[0]).toEqual([0,{action:'wait_click',threshold:0.85,poll_interval_seconds:1,timeout_seconds:25}])
 w.unmount()
})
it('does not offer copy or deletion for lifecycle steps in the canvas menu', async () => {
 const w=mount(WorkflowCanvas,{props:{steps:[{action:'start'},{action:'launch_app'},{action:'cleanup'}],selected:1,disabled:false,scriptId:'script-1'},attachTo:document.body})
 try {
  await w.findAll('.graph-node')[1]!.trigger('contextmenu',{clientX:300,clientY:200})
  expect(document.body.textContent).toContain('启动应用')
  expect(document.querySelector('.graph-menu')?.textContent).not.toContain('复制节点')
  expect(document.querySelector('.graph-menu')?.textContent).not.toContain('删除节点')
  expect(w.findAll('.graph-node')[2]!.text()).toContain('结束应用并清理')
 } finally { w.unmount() }
})
it('renders start without redundant summaries or normal-flow text', () => {
 const w=mount(WorkflowCanvas,{props:{steps:[{action:'start'}],selected:0,disabled:false,scriptId:'script-1'}})
 try {
  expect(w.find('.graph-node').text()).toBe('01 · 开始')
  expect(w.find('.node-title').attributes('data-node-drag-handle')).toBeDefined()
  expect(w.find('.inline-fields').exists()).toBe(false)
 } finally { w.unmount() }
})
