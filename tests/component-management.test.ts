import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/app/App.vue'
import Health from '../src/shared/ui/PlatformHealth.vue'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),push:vi.fn()}))
vi.mock('../src/shared/api/client',()=>({apiClient:api}))
vi.mock('vue-router',()=>({useRoute:()=>({path:'/terminals',fullPath:'/terminals'}),useRouter:()=>api}))
const wrappers:{unmount:()=>void}[]=[]
function health(){const w=mount(Health);wrappers.push(w);return w}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();api.get.mockResolvedValue({data:{status:'ready',dependencies:{postgresql:{status:'ready'},s3:{status:'ready'},mqtt:{status:'ready'}}}})})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.useRealTimers()})
it('moves the entry into the administrator menu and removes the header probe',async()=>{
 const w=mount(App,{global:{plugins:[createPinia()],stubs:{RouterView:true,RouterLink:true,BrandLogo:true,ThemeMenu:true,ElDropdown:{name:'ElDropdown',template:'<div><slot/><slot name="dropdown"/></div>'},ElDropdownMenu:{template:'<div><slot/></div>'},ElDropdownItem:{template:'<div><slot/></div>'}}}});wrappers.push(w);await flushPromises()
 expect(w.find('.health-button').exists()).toBe(false)
 expect(w.text()).toContain('组件管理')
 w.getComponent({name:'ElDropdown'}).vm.$emit('command','components');await flushPromises()
 expect(api.push).toHaveBeenCalledWith('/maintenance/components')
 expect(api.get).not.toHaveBeenCalled()
})
it('shows dependencies directly and preserves unknown/error feedback',async()=>{
 const w=health();await flushPromises()
 expect(w.find('.health-button').exists()).toBe(false)
 expect(w.findAll('[data-dependency]')).toHaveLength(3)
 api.get.mockResolvedValueOnce({data:{status:'not_ready',dependencies:{mqtt:{status:'not_ready',reason:'mqtt_unavailable'}}}})
 await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('mqtt_unavailable')
 api.get.mockRejectedValueOnce(new Error('offline'));await w.get('button').trigger('click');await flushPromises()
 expect(w.text()).toContain('状态未知');expect(w.text()).toContain('无法获取平台状态')
})
it('refreshes after sixty seconds and stops after unmount',async()=>{
 const w=health();await flushPromises();expect(api.get).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(60000);expect(api.get).toHaveBeenCalledTimes(2)
 w.unmount();await vi.advanceTimersByTimeAsync(120000);expect(api.get).toHaveBeenCalledTimes(2)
})
it('does not duplicate an in-flight check or restart polling after a late reply',async()=>{
 let finish!:(value:unknown)=>void
 api.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
 const w=health();await flushPromises()
 await w.get('button').trigger('click');await vi.advanceTimersByTimeAsync(60000)
 expect(api.get).toHaveBeenCalledTimes(1)
 w.unmount();finish({data:{status:'ready',dependencies:{mqtt:{status:'ready'}}}});await flushPromises()
 await vi.advanceTimersByTimeAsync(120000);expect(api.get).toHaveBeenCalledTimes(1)
})
