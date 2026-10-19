<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowStep } from '../../../shared/api/maa-script-editor'
const props = defineProps<{ step: WorkflowStep; compact?: boolean }>()
const anchorNames: Record<string, string> = {
  center: '中心', top_left: '左上角', top_right: '右上角',
  bottom_left: '左下角', bottom_right: '右下角',
}
const anchor = computed(() => anchorNames[String(props.step.match_anchor ?? 'center')] ?? String(props.step.match_anchor))
const offset = computed(() => `${props.step.match_offset_x ?? 0}, ${props.step.match_offset_y ?? 0}`)
const color = computed(() => {
  const lower = props.step.marker_hsv_lower ?? [10, 160, 200]
  const upper = props.step.marker_hsv_upper ?? [40, 255, 255]
  if (![lower, upper].every(value => Array.isArray(value) && value.length === 3 &&
    value.every((channel, index) => typeof channel === 'number' && Number.isFinite(channel) &&
      channel >= 0 && channel <= (index === 0 ? 179 : 255)))) return 'var(--accent)'
  const lo = lower as number[], hi = upper as number[]
  const hue = (lo[0]! + hi[0]!) / 60, saturation = (lo[1]! + hi[1]!) / 510, value = (lo[2]! + hi[2]!) / 2
  const chroma = value * saturation, secondary = chroma * (1 - Math.abs(hue % 2 - 1)), base = value - chroma
  const channels = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]][Math.floor(hue) % 6]!
  return `rgb(${channels.map(channel => Math.round(channel + base)).join(', ')})`
})
</script>
<template>
  <div class="marker-summary" :class="{ compact }" aria-label="颜色标记循环说明">
    <strong v-if="!compact">颜色标记循环</strong>
    <div class="marker-target"><span class="marker-bars" :style="{ color }" aria-hidden="true"><i /><i /><i /></span><span>三条颜色标记（示意）</span></div>
    <p>每次点击后重新识别</p>
    <p>连续无标记后结束</p>
    <dl>
      <div><dt>点击上限：</dt><dd>{{ step.match_max_clicks ?? '未设置' }}</dd></div>
      <div><dt>点击定位：</dt><dd>标记{{ anchor }} + 偏移 ({{ offset }})</dd></div>
    </dl>
    <p v-if="!compact" class="marker-note">按标记位置计算点击点；改变界面后重新定位。此模式使用颜色检测。</p>
  </div>
</template>
<style scoped>
.marker-summary { display:grid; gap:8px; min-width:0; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--surface-soft); color:var(--text); font-size:12px; line-height:1.5; }
.marker-summary.compact { gap:4px; padding:9px; font-size:11px; }
.marker-summary p { margin:0; }
.marker-target { display:flex; align-items:center; gap:10px; font-weight:600; }
.marker-bars { display:flex; flex-direction:column; justify-content:center; gap:4px; width:24px; height:30px; flex-shrink:0; }
.marker-bars i { display:block; height:4px; width:22px; border-radius:3px; background:currentColor; }
.marker-bars i:first-child { transform:rotate(25deg); }.marker-bars i:last-child { transform:rotate(-25deg); }
dl { margin:0; color:var(--muted); }dl div { display:flex; flex-wrap:wrap; }dt,dd { margin:0; overflow-wrap:anywhere; }
.marker-note { color:var(--muted); }
</style>
