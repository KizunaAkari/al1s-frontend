<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
const props=withDefaults(defineProps<{ landscape:boolean; connected?:boolean; docked?:boolean }>(),{connected:true,docked:false})
const host=ref<HTMLElement>(), open=ref(true)
const x=ref(0),y=ref(0),width=ref(420),height=ref(760)
const bounds=reactive({width:0,height:0,left:0,top:0})
const dockBounds=reactive({left:0,top:0,width:0,height:0,visible:false})
let initialized=false, moved=false
let observer:ResizeObserver|undefined
let gesture:{id:number;kind:'move'|'resize';px:number;py:number;x:number;y:number;w:number;h:number}|undefined
const style=computed(()=>props.docked?{left:dockBounds.left+'px',top:dockBounds.top+'px',width:dockBounds.width+'px',height:dockBounds.height+'px'}:{left:(bounds.left+x.value)+'px',top:(bounds.top+y.value)+'px',width:width.value+'px',height:(open.value?height.value:50)+'px'})
function clamp(){
 if(!bounds.width||!bounds.height)return
 width.value=Math.min(bounds.width,Math.max(Math.min(300,bounds.width),width.value))
 height.value=Math.min(bounds.height,Math.max(Math.min(props.connected?300:180,bounds.height),height.value))
 x.value=Math.max(0,Math.min(x.value,bounds.width-width.value))
 y.value=Math.max(0,Math.min(y.value,bounds.height-(open.value?height.value:50)))
}
function orient(){
 width.value=props.connected?(props.landscape?720:420):360
 height.value=props.connected?Math.min(props.landscape?470:760,Math.max(300,bounds.height-48)):240
 if(!moved){x.value=Math.max(0,bounds.width-width.value-24);y.value=24}
 clamp()
}
watch(()=>[props.landscape,props.connected],orient)
watch(open,clamp)
watch(()=>props.docked,async value=>{
 if(value)open.value=true
 await nextTick()
 const target=document.getElementById('editor-config-live-host')
 if(value && target)observer?.observe(target)
 measure()
})
function start(e:PointerEvent,kind:'move'|'resize'){
 if(props.docked||e.button!==0||(e.target as HTMLElement).closest('button'))return
 e.preventDefault();(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
 gesture={id:e.pointerId,kind,px:e.clientX,py:e.clientY,x:x.value,y:y.value,w:width.value,h:height.value}
}
function move(e:PointerEvent){
 const g=gesture;if(!g||g.id!==e.pointerId)return
 const dx=e.clientX-g.px,dy=e.clientY-g.py
 if(g.kind==='move'){x.value=g.x+dx;y.value=g.y+dy;moved=true}
 else{width.value=Math.min(g.w+dx,bounds.width-x.value);height.value=Math.min(g.h+dy,bounds.height-y.value)}
 clamp()
}
function end(){gesture=undefined}
function key(e:KeyboardEvent,kind:'move'|'resize'){
 if(props.docked)return
 const dx=e.key==='ArrowLeft'?-16:e.key==='ArrowRight'?16:0
 const dy=e.key==='ArrowUp'?-16:e.key==='ArrowDown'?16:0
 if(!dx&&!dy)return;e.preventDefault()
 if(kind==='move'){x.value+=dx;y.value+=dy;moved=true}else{width.value+=dx;height.value+=dy}
 clamp()
}
function measure(){
 const panels=host.value?.closest('.studio-panels') ?? document.querySelector('.studio-panels')
 const shell=panels?.closest('.app-main')
 const header=shell?.querySelector('.app-header')
 const rect=panels?.getBoundingClientRect()
 const shellRect=shell?.getBoundingClientRect()
 const headerRect=header?.getBoundingClientRect()
 const usable=rect && rect.width>0 && rect.height>0
 const left=usable?Math.max(0,shellRect?.left ?? rect.left):8,top=usable?Math.max(0,headerRect?.top ?? rect.top):8
 const right=usable?Math.min(window.innerWidth,shellRect?.right ?? rect.right):window.innerWidth-8
 const bottom=usable?Math.min(window.innerHeight,rect.bottom):window.innerHeight-8
 Object.assign(bounds,{left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)})
 if(!initialized){initialized=true;orient()}else{clamp();if(!moved)x.value=Math.max(0,bounds.width-width.value-24)}
 if(props.docked){
  const target=document.getElementById('editor-config-live-host')
  const dock=target?.getBoundingClientRect()
  const region=target?.closest('.config-columns')?.getBoundingClientRect()
  if(dock && region){
   const left=Math.max(dock.left,region.left,0),top=Math.max(dock.top,region.top,0)
   const right=Math.min(dock.right,region.right,window.innerWidth),bottom=Math.min(dock.bottom,region.bottom,window.innerHeight)
   Object.assign(dockBounds,{left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top),visible:right-left>200&&bottom-top>160})
  }
 }
}
onMounted(()=>{
 const parent=host.value?.closest('.studio-panels')??host.value?.parentElement;if(!parent)return
 observer=new ResizeObserver(measure);observer.observe(parent)
 const shell=parent.closest('.app-main');if(shell)observer.observe(shell)
 window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true)
 measure()
})
onBeforeUnmount(()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true)})
</script>
<template>
 <section ref="host" class="studio-phone" :class="{landscape,collapsed:!open,docked,'dock-outside':docked&&!dockBounds.visible}" :style="style" aria-label="悬浮手机预览">
  <header tabindex="0" aria-label="拖动手机预览，方向键移动" @pointerdown="start($event,'move')" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="key($event,'move')">
   <span class="floating-grip" aria-hidden="true">⠿</span><strong>手机预览</strong>
   <ElButton v-if="!docked" :icon="open?ArrowUp:ArrowDown" :aria-label="open?'折叠':'展开'" :title="open?'折叠':'展开'" @click="open=!open" />
  </header>
  <div v-show="open" class="floating-body"><slot /></div>
  <div v-show="open && !docked" class="floating-resize" tabindex="0" role="button" aria-label="调整悬浮窗口大小，支持方向键" @pointerdown="start($event,'resize')" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="key($event,'resize')">◢</div>
 </section>
</template>
<style scoped>
.studio-phone{position:fixed;z-index:15;display:flex;flex-direction:column;min-width:0;min-height:0;box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 32px #153b6526;overflow:visible}
.studio-phone.docked{border-radius:8px;box-shadow:none}
.studio-phone.dock-outside{visibility:hidden;pointer-events:none}
.studio-phone.docked header{cursor:default}
header{display:flex;align-items:center;gap:8px;flex-shrink:0;height:50px;box-sizing:border-box;padding:6px 12px;cursor:move;touch-action:none;background:var(--surface-soft);border-bottom:1px solid var(--border);border-radius:11px 11px 0 0;user-select:none}
header strong{margin-right:auto;font-size:15px}.floating-grip{color:var(--muted);font-size:19px;line-height:1}
header :deep(.el-button){width:36px;height:36px;margin:0;padding:0}
.floating-body{display:flex;flex:1;min-height:0;overflow:visible}
.floating-resize{position:absolute;bottom:2px;right:3px;width:22px;height:22px;text-align:right;color:var(--accent);cursor:nwse-resize;touch-action:none}
</style>
