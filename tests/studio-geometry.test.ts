import { describe, expect, it } from 'vitest'
import { videoPoint, nativePoint } from '../src/modules/maa/editor/video-coordinates'
import { connectSkip } from '../src/modules/maa/editor/workflow-links'
describe('video coordinate mapping',()=>{
 it('maps portrait display with side letterboxing',()=>{
  const rect={left:10,top:20,width:400,height:400},size={width:100,height:200}
  expect(videoPoint(210,220,rect,size)).toEqual({x:50,y:100,...size})
  expect(videoPoint(20,220,rect,size)).toBeNull()
 })
 it('maps landscape with top and bottom letterboxing',()=>{
  expect(videoPoint(200,200,{left:0,top:0,width:400,height:400},{width:200,height:100})).toEqual({x:100,y:50,width:200,height:100})
  expect(videoPoint(200,20,{left:0,top:0,width:400,height:400},{width:200,height:100})).toBeNull()
 })
 it('rejects unsynchronized or zero dimensions',()=>{
  expect(videoPoint(1,1,{left:0,top:0,width:400,height:400},{width:0,height:0})).toBeNull()
 })
 it('maps a scaled video pick to matching native screenshot dimensions',()=>{
  expect(nativePoint({x:288,y:640,width:576,height:1280},{width:1080,height:2400})).toEqual({x:540,y:1200,width:1080,height:2400})
 })
 it('rejects rotated screenshots',()=>{
  expect(()=>nativePoint({x:288,y:640,width:576,height:1280},{width:2400,height:1080})).toThrow('方向或比例')
 })
})
describe('workflow edges preserve semantics',()=>{
 const doc={steps:[{action:'wait',skip_condition:{enabled:true,mode:'numeric',operator:'gt',value:5}}, {action:'wait'},{action:'home'}]}
 it('changes only the existing conditional target',()=>{
  const result=connectSkip(doc,0,2)
  expect(result.steps[0]!.skip_condition).toEqual({enabled:true,mode:'numeric',operator:'gt',value:5,skip_to_step_index:3})
  expect(doc.steps[0]!.skip_condition).not.toHaveProperty('skip_to_step_index')
  expect(result.steps[1]).toBe(doc.steps[1])
 })
 it('rejects cycles and unsupported ports',()=>{
  expect(()=>connectSkip(doc,0,0)).toThrow('后续')
  expect(()=>connectSkip(doc,2,0)).toThrow('后续')
  expect(()=>connectSkip(doc,1,2)).toThrow('配置')
 })
})

