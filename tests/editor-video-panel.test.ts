import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { apiClient, ApiError } from '../src/shared/api/client'
import { ElMessageBox } from 'element-plus'
import EditorVideoPanel from '../src/modules/maa/editor/EditorVideoPanel.vue'
import { connectPhoneVideo } from '../src/modules/maa/editor/video-connection'
import { connectPhoneControl, touchPacket } from '../src/modules/maa/editor/control-connection'
vi.mock('../src/modules/maa/editor/video-connection',()=>({connectPhoneVideo:vi.fn(()=>vi.fn())}))
vi.mock('../src/modules/maa/editor/control-connection',()=>({connectPhoneControl:vi.fn(()=>({close:vi.fn(),send:vi.fn()})),keyPacket:vi.fn(),touchPacket:vi.fn()}))
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();vi.useRealTimers();sessionStorage.clear()})
const active={session_id:'session',status:'active',connection:{video_ws_url:'wss://terminal/video',control_ws_url:'wss://terminal/control',screenshot_ws_url:'wss://terminal/screenshot'}}
function panel(){return mount(EditorVideoPanel,{props:{deviceId:'phone'},global:{stubs:{ElButton:{template:'<button><slot /></button>'},ElAlert:true}}})}
function setup(){
 const post=vi.spyOn(apiClient,'post').mockResolvedValue({data:active})
 const get=vi.spyOn(apiClient,'get').mockResolvedValue({data:active})
 const remove=vi.spyOn(apiClient,'delete').mockResolvedValue({data:{...active,status:'closing'}})
 return {post,get,remove}
}
it('automatically connects, grants control only after ready and retires on unmount',async()=>{
 const {post,remove}=setup();const wrapper=panel();await flushPromises()
 expect(post).toHaveBeenCalledOnce();expect(connectPhoneVideo).toHaveBeenCalledOnce()
 expect(wrapper.emitted('screenshotUrl')?.at(-1)?.[0]).toBe('wss://terminal/screenshot')
 expect(connectPhoneControl).not.toHaveBeenCalled()
 const callbacks=vi.mocked(connectPhoneVideo).mock.calls[0]!
 callbacks[4]!(576,1280);callbacks[3]!();await flushPromises()
 expect(connectPhoneControl).toHaveBeenCalledOnce()
 expect(wrapper.text()).toContain('控制暂不可用，恢复后自动重连')
 expect(wrapper.text()).not.toContain('等待终端授权')
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 vi.mocked(connectPhoneControl).mock.calls[0]![1]();await flushPromises()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeUndefined()
 expect(wrapper.text()).not.toContain('坐标拾取');expect(wrapper.find('.snapshot-tools').exists()).toBe(false)
 wrapper.unmount();expect(remove).toHaveBeenCalledWith('/editor-sessions/session')
 expect(wrapper.emitted('screenshotUrl')?.at(-1)?.[0]).toBeUndefined()
})
it('recovers a failed video on the same lease without closing it',async()=>{
 vi.useFakeTimers();const {post,remove}=setup();remove.mockRejectedValue(new Error('network'))
 const wrapper=panel();await flushPromises()
 vi.mocked(connectPhoneVideo).mock.calls[0]![2](new Error('failed'));await flushPromises()
 await vi.advanceTimersByTimeAsync(2000);await flushPromises()
 expect(remove).not.toHaveBeenCalled();expect(post).toHaveBeenCalledOnce();expect(connectPhoneVideo).toHaveBeenCalledTimes(2)
 wrapper.unmount()
})
it('retains creation request across a lost response and remount',async()=>{
 const {post}=setup();post.mockRejectedValue(new Error('network'))
 let wrapper=panel();await flushPromises();wrapper.unmount()
 wrapper=panel();await flushPromises()
 expect(post.mock.calls[0]![2]).toEqual(post.mock.calls[1]![2]);wrapper.unmount()
})
it('recovers 409 only with confirmation and closed acknowledgement',async()=>{
 vi.useFakeTimers();const {post,get,remove}=setup()
 post.mockRejectedValueOnce(new ApiError('busy',{code:'editor_device_busy',status:409}))
 vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
 const wrapper=panel();await flushPromises();expect(remove).not.toHaveBeenCalled()
 await wrapper.findAll('button').find(b=>b.text()==='关闭旧会话并重连')!.trigger('click');await flushPromises()
 expect(post).toHaveBeenCalledOnce()
 get.mockResolvedValueOnce({data:{...active,status:'closed'}})
 await vi.advanceTimersByTimeAsync(2000);await flushPromises()
 expect(post).toHaveBeenCalledTimes(2);expect(post.mock.calls[0]![2]).not.toEqual(post.mock.calls[1]![2]);wrapper.unmount()
})
it('revokes control immediately when platform permission is rejected',async()=>{
 vi.useFakeTimers();const {get}=setup();const wrapper=panel();await flushPromises()
 const callbacks=vi.mocked(connectPhoneVideo).mock.calls[0]!
 callbacks[4]!(576,1280);callbacks[3]!()
 vi.mocked(connectPhoneControl).mock.calls[0]![1]();await flushPromises()
 get.mockRejectedValue(new ApiError('forbidden',{code:'forbidden',status:403}))
 await vi.advanceTimersByTimeAsync(2000);await flushPromises()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 expect(vi.mocked(connectPhoneControl).mock.results[0]!.value.close).toHaveBeenCalled()
 wrapper.unmount()
})
it('reopens Android media after revoked control without replaying gestures or changing the lease',async()=>{
 vi.useFakeTimers();const {post,get,remove}=setup()
 const direct={...active,connection:{...active.connection,transport:'android-reverse-v1'}}
 post.mockResolvedValue({data:direct});get.mockResolvedValue({data:direct})
 const wrapper=panel();await flushPromises()
 const video=vi.mocked(connectPhoneVideo).mock.calls[0]!
 video[4]!(720,1600);video[3]!();await flushPromises()
 const callbacks=vi.mocked(connectPhoneControl).mock.calls[0]!
 callbacks[1]();await flushPromises()
 callbacks[2]();await flushPromises()
 expect(vi.mocked(connectPhoneVideo).mock.results[0]!.value).toHaveBeenCalledOnce()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 await vi.advanceTimersByTimeAsync(5000);await flushPromises()
 expect(connectPhoneVideo).toHaveBeenCalledTimes(2)
 expect(post).toHaveBeenCalledOnce();expect(remove).not.toHaveBeenCalled()
 callbacks[1]();await flushPromises()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 expect(vi.mocked(connectPhoneControl).mock.results[0]!.value.send).not.toHaveBeenCalled()
 wrapper.unmount()
})
it('keeps control through transient failures for only ten seconds from the last confirmation',async()=>{
 vi.useFakeTimers();const {get}=setup();const wrapper=panel();await flushPromises()
 const video=vi.mocked(connectPhoneVideo).mock.calls[0]!
 video[4]!(720,1600);video[3]!();vi.mocked(connectPhoneControl).mock.calls[0]![1]();await flushPromises()
 const control=vi.mocked(connectPhoneControl).mock.results[0]!.value
 get.mockRejectedValue(new ApiError('busy',{code:'database_busy',status:503}))
 await vi.advanceTimersByTimeAsync(9999);await flushPromises()
 expect(control.close).not.toHaveBeenCalled()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeUndefined()
 expect(wrapper.find('el-alert-stub').attributes('title')).toContain('连接波动')
 await vi.advanceTimersByTimeAsync(1);await flushPromises()
 expect(control.close).toHaveBeenCalledOnce()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 get.mockResolvedValue({data:active})
 await vi.advanceTimersByTimeAsync(2000);await flushPromises()
 expect(connectPhoneControl).toHaveBeenCalledTimes(2)
 expect(control.send).not.toHaveBeenCalled()
 expect(wrapper.find('el-alert-stub').exists()).toBe(false)
 wrapper.unmount()
})
it('expires confirmation during a hung poll and does not start overlapping polls',async()=>{
 vi.useFakeTimers();const {get}=setup();const wrapper=panel();await flushPromises()
 const video=vi.mocked(connectPhoneVideo).mock.calls[0]!
 video[4]!(720,1600);video[3]!();vi.mocked(connectPhoneControl).mock.calls[0]![1]();await flushPromises()
 let resolve!:(value:unknown)=>void
 get.mockImplementation(()=>new Promise(r=>{resolve=r}))
 await vi.advanceTimersByTimeAsync(2000);await flushPromises()
 const count=get.mock.calls.length
 await vi.advanceTimersByTimeAsync(8000);await flushPromises()
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 await wrapper.findAll('button').find(b=>b.text()==='重试')!.trigger('click');await flushPromises()
 await vi.advanceTimersByTimeAsync(12000);await flushPromises()
 expect(get.mock.calls.length).toBe(count)
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 resolve({data:active});await flushPromises()
 // A response to a request older than the window cannot revive input.
 expect(wrapper.find('[aria-label="主页"]').attributes('disabled')).toBeDefined()
 wrapper.unmount()
})
it('keeps Linux video playing when only its control channel closes',async()=>{
 vi.useFakeTimers();setup();const wrapper=panel();await flushPromises()
 const video=vi.mocked(connectPhoneVideo).mock.calls[0]!
 video[4]!(720,1600);video[3]!();await flushPromises()
 vi.mocked(connectPhoneControl).mock.calls[0]![2]();await flushPromises()
 await vi.advanceTimersByTimeAsync(6000);await flushPromises()
 expect(connectPhoneVideo).toHaveBeenCalledOnce()
 expect(vi.mocked(connectPhoneVideo).mock.results[0]!.value).not.toHaveBeenCalled()
 expect(connectPhoneControl).toHaveBeenCalledTimes(2)
 wrapper.unmount()
})
it.each(['pointerup','pointercancel','lostpointercapture'])('releases a drag outside the video on %s without closing control',async releaseEvent=>{
 setup();const wrapper=panel();await flushPromises()
 const canvas=wrapper.find('canvas').element as HTMLCanvasElement
 canvas.width=576;canvas.height=1280
 canvas.setPointerCapture=vi.fn()
 vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:576,height:1280} as DOMRect)
 const callbacks=vi.mocked(connectPhoneVideo).mock.calls[0]!
 callbacks[4]!(576,1280);callbacks[3]!()
 vi.mocked(connectPhoneControl).mock.calls[0]![1]();await flushPromises()
 const control=vi.mocked(connectPhoneControl).mock.results[0]!.value
 await wrapper.find('canvas').trigger('pointerdown',{pointerId:7,button:0,clientX:100,clientY:200})
 await wrapper.find('canvas').trigger('pointermove',{pointerId:7,button:-1,clientX:-20,clientY:200})
 await wrapper.find('canvas').trigger(releaseEvent,{pointerId:7,button:-1,clientX:-20,clientY:200})
 expect(vi.mocked(touchPacket).mock.calls).toEqual([[0,100,200,576,1280],[1,100,200,576,1280]])
 expect(control.send).toHaveBeenCalledTimes(2)
 expect(control.close).not.toHaveBeenCalled()
 expect(wrapper.text()).toContain('可控制')
 await wrapper.find('canvas').trigger('lostpointercapture',{pointerId:7,button:-1,clientX:-20,clientY:200})
 expect(control.send).toHaveBeenCalledTimes(2)
 wrapper.unmount()
})
it('closes a late creation response after leaving',async()=>{
 const {post,remove}=setup();let resolve!:(value:unknown)=>void
 post.mockImplementation(()=>new Promise(r=>{resolve=r}))
 const wrapper=panel();wrapper.unmount();resolve({data:active});await flushPromises()
 expect(remove).toHaveBeenCalledWith('/editor-sessions/session');expect(connectPhoneVideo).not.toHaveBeenCalled()
})

it('bounds automatic retries, ignores retired callbacks, and retries immediately on request',async()=>{
 vi.useFakeTimers();const {post,remove}=setup();const wrapper=panel();await flushPromises()
 for(let attempt=0;attempt<4;attempt++){
   vi.mocked(connectPhoneVideo).mock.calls[attempt]![2](new Error('lost'))
   await vi.advanceTimersByTimeAsync([500,1000,2000,10000][attempt]!);await flushPromises()
 }
 expect(connectPhoneVideo).toHaveBeenCalledTimes(4)
 expect(wrapper.find('el-alert-stub').attributes('title')).toContain('画面恢复失败')
 await wrapper.findAll('button').find(b=>b.text()==='重试')!.trigger('click');await flushPromises()
 expect(connectPhoneVideo).toHaveBeenCalledTimes(5)
 vi.mocked(connectPhoneVideo).mock.calls[0]![2](new Error('stale'))
 vi.mocked(connectPhoneVideo).mock.calls[0]![3]!()
 await flushPromises()
 expect(wrapper.text()).not.toContain('stale')
 expect(connectPhoneControl).not.toHaveBeenCalled()
 expect(post).toHaveBeenCalledOnce();expect(remove).not.toHaveBeenCalled()
 wrapper.unmount()
})
