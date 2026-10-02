import { expect, it } from 'vitest'
import { debugProgress } from '../src/modules/maa/editor/quick-test-progress'
import { defaultNodeLayout } from '../src/modules/maa/editor/canvas-layout'
import type { QuickTestDetail, QuickTestEvent } from '../src/shared/api/maa-quick-test'

const detail: QuickTestDetail = { session_id:'s', candidate_version_id:'v', status:'claimed', expires_at:'2099-01-01',
  qualification_status:null, error_code:null, step_number:null, failed_step_number:null }
const event = (sequence:number, kind:QuickTestEvent['kind'], step:number):QuickTestEvent =>
  ({sequence,kind,step_number:step,code:null,created_at:'2026-09-29T00:00:00Z'})

it('does not confuse a claimed permit with actual execution, follows ordered step events', () => {
  expect(debugProgress(detail, []).phase).toBe('waiting')
  expect(debugProgress(detail, [event(3,'step_started',3),event(1,'step_started',1),event(2,'step_succeeded',1)]))
    .toMatchObject({step:3,phase:'running',completed:[1]})
})
it('pins the final failed step even when cleanup or delayed events follow it', () => {
  const result=debugProgress({...detail,status:'completed',qualification_status:'failed',failed_step_number:3},
    [event(1,'step_succeeded',1),event(2,'step_failed',3),event(3,'step_started',8),event(4,'step_succeeded',8)])
  expect(result).toMatchObject({step:3,phase:'failed',completed:[1,8]})
})
it('does not freeze on an intermediate failure when configured recovery retries it', () => {
  expect(debugProgress(detail,[event(1,'step_failed',3),event(2,'step_started',3),event(3,'step_succeeded',3),event(4,'step_started',4)]))
    .toMatchObject({step:4,phase:'running',completed:[3]})
  expect(debugProgress(undefined,[])).toMatchObject({step:null,phase:'idle',completed:[]})
})
it('keeps completion and cancellation distinct from failure', () => {
  expect(debugProgress({...detail,status:'completed',qualification_status:'passed'},[event(1,'step_started',3)]).phase).toBe('passed')
  expect(debugProgress({...detail,status:'cancelled'},[]).phase).toBe('cancelled')
  expect(debugProgress({...detail,status:'completed'},[]).phase).toBe('finished')
})
it('lays out compact start and content-sized rows without allocating full node slots', () => {
  const layout=defaultNodeLayout([{action:'start'},{action:'wait'},{action:'wait_click'},{action:'back'},{action:'home'}],{2:270})
  expect(layout[0]).toEqual({x:0,y:0,width:132,height:52})
  expect(layout[1]?.x).toBe(176)
  expect(layout[4]?.y).toBe(314)
  expect(layout[4]?.x).toBe(0)
})
