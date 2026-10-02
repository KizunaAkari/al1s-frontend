import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FloatingPhonePanel from '../src/modules/maa/editor/FloatingPhonePanel.vue'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('anchors top right, follows orientation, clamps and preserves content through collapse',async()=>{
 let resize=()=>{}
 vi.stubGlobal('ResizeObserver',class{constructor(fn:()=>void){resize=fn}observe(){}disconnect(){}})
 let w=1000,h=700
 vi.spyOn(window,'innerWidth','get').mockImplementation(()=>w+80)
 vi.spyOn(window,'innerHeight','get').mockImplementation(()=>h+68)
 const workspace=document.createElement('div');workspace.className='studio-panels';document.body.append(workspace)
 workspace.getBoundingClientRect=()=>({left:80,top:68,right:80+w,bottom:68+h,width:w,height:h} as DOMRect)
 const wrapper=mount(FloatingPhonePanel,{props:{landscape:false},slots:{default:'<canvas />'},attachTo:workspace,global:{stubs:{ElButton:{template:'<button><slot /></button>'}}}})
 resize();await nextTick()
 const panel=()=>wrapper.element as HTMLElement
 expect(panel().style.left).toBe('636px')
 expect(panel().style.top).toBe('92px')
 expect(panel().style.height).toBe('652px')
 const canvas=wrapper.find('canvas').element
 await wrapper.setProps({landscape:true})
 expect(panel().style.width).toBe('720px');expect(panel().style.height).toBe('470px')
 await wrapper.find('header').trigger('keydown',{key:'ArrowLeft'})
 expect(panel().style.left).toBe('320px')
 await wrapper.find('header').trigger('keydown',{key:'ArrowDown'})
 expect(panel().style.top).toBe('108px')
 await wrapper.find('button').trigger('click')
 expect(panel().style.height).toBe('50px')
 await wrapper.find('button').trigger('click')
 expect(wrapper.find('canvas').element).toBe(canvas)
 w=340;h=500;resize();await nextTick()
 expect(panel().style.width).toBe('340px');expect(panel().style.left).toBe('80px')
 await wrapper.setProps({landscape:false})
 expect(panel().style.height).toBe('452px')
 await wrapper.setProps({connected:false})
 expect(panel().style.height).toBe('240px')
 wrapper.unmount()
 workspace.remove()
})

it('allows the preview into the editor header and docks the same content in configuration', async () => {
 let resize=()=>{}
 vi.stubGlobal('ResizeObserver',class{constructor(fn:()=>void){resize=fn}observe(){}disconnect(){}})
 vi.spyOn(window,'innerWidth','get').mockReturnValue(1200)
 vi.spyOn(window,'innerHeight','get').mockReturnValue(900)
 const shell=document.createElement('div');shell.className='app-main'
 const header=document.createElement('header');header.className='app-header'
 const workspace=document.createElement('div');workspace.className='studio-panels'
 const columns=document.createElement('div');columns.className='config-columns'
 const live=document.createElement('div');live.id='editor-config-live-host';columns.append(live);workspace.append(columns)
 shell.append(header,workspace);document.body.append(shell)
 shell.getBoundingClientRect=()=>({left:80,top:0,right:1200,bottom:900,width:1120,height:900} as DOMRect)
 header.getBoundingClientRect=()=>({left:80,top:0,right:1200,bottom:68,width:1120,height:68} as DOMRect)
 workspace.getBoundingClientRect=()=>({left:80,top:68,right:1200,bottom:858,width:1120,height:790} as DOMRect)
 columns.getBoundingClientRect=()=>({left:80,top:130,right:1200,bottom:858,width:1120,height:728} as DOMRect)
 live.getBoundingClientRect=()=>({left:340,top:182,right:800,bottom:858,width:460,height:676} as DOMRect)
 const wrapper=mount(FloatingPhonePanel,{props:{landscape:false},slots:{default:'<canvas />'},attachTo:workspace,global:{stubs:{ElButton:{template:'<button><slot /></button>'}}}})
 try {
  resize();await nextTick()
  const canvas=wrapper.find('canvas').element
  for(let i=0;i<5;i++)await wrapper.find('header').trigger('keydown',{key:'ArrowUp'})
  expect(Number.parseInt((wrapper.element as HTMLElement).style.top)).toBeLessThan(68)
  await wrapper.setProps({docked:true})
  resize()
  await nextTick()
  expect((wrapper.element as HTMLElement).style.left).toBe('340px')
  expect((wrapper.element as HTMLElement).style.top).toBe('182px')
  expect((wrapper.element as HTMLElement).style.width).toBe('460px')
  expect((wrapper.element as HTMLElement).style.height).toBe('676px')
  expect(wrapper.find('canvas').element).toBe(canvas)
  await wrapper.setProps({docked:false})
  expect(wrapper.find('canvas').element).toBe(canvas)
 } finally { wrapper.unmount();shell.remove() }
})

it('hides the docked panel when its live column scrolls out of view without replacing video', async () => {
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
 const workspace=document.createElement('div');workspace.className='studio-panels'
 const columns=document.createElement('div');columns.className='config-columns'
 const live=document.createElement('div');live.id='editor-config-live-host'
 columns.append(live);workspace.append(columns);document.body.append(workspace)
 columns.getBoundingClientRect=()=>({left:0,top:100,right:800,bottom:600,width:800,height:500} as DOMRect)
 let top=150
 live.getBoundingClientRect=()=>({left:200,top,right:650,bottom:top+400,width:450,height:400} as DOMRect)
 const wrapper=mount(FloatingPhonePanel,{props:{landscape:false,docked:true},slots:{default:'<canvas />'},attachTo:workspace})
 try {
  const canvas=wrapper.find('canvas').element
  window.dispatchEvent(new Event('scroll'));await nextTick()
  expect(wrapper.classes()).not.toContain('dock-outside')
  top=650;window.dispatchEvent(new Event('scroll'));await nextTick()
  expect(wrapper.classes()).toContain('dock-outside')
  top=150;window.dispatchEvent(new Event('scroll'));await nextTick()
  expect(wrapper.find('canvas').element).toBe(canvas)
  expect(wrapper.classes()).not.toContain('dock-outside')
 } finally {wrapper.unmount();workspace.remove()}
})
