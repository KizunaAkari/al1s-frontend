<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import type { LineupCatalogStudent, LineupSide } from '../../shared/api/lineup'
import type { AnnotationDocument, AnnotationRegion, AnnotationSlot, WorkspaceDetail } from '../../shared/api/lineup-workspace'
import LineupAnnotationCanvas from './LineupAnnotationCanvas.vue'
import { cloneAnnotation, resizeTeam, updateRegion } from './annotation-draft'

const props = defineProps<{ detail: WorkspaceDetail; imageUrl: string; modelValue: AnnotationDocument;
  catalog: LineupCatalogStudent[]; busy: boolean; dirty: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: AnnotationDocument]; save: []; reset: []; export: [] }>()
const active = ref(''), kind = ref<'portrait' | 'name'>('portrait'), drawing = ref(false)
const slotKey = (slot: AnnotationSlot) => `${slot.side}-${slot.index}`
const selected = computed(() => props.modelValue.slots.find(s => slotKey(s) === active.value))
const activeKey = computed(() => selected.value ? `${active.value}-${kind.value}` : null)
const regions = computed(() => props.modelValue.slots.flatMap(s => s.regions.map(r => ({ ...r, side: s.side, index: s.index }))))
const activeRegion = computed(() => selected.value?.regions.find(r => r.kind === kind.value))
const students = computed(() => new Map(props.catalog.map(s => [s.id, s.name])))
const sideLabel = (side: LineupSide) => side === 'attack' ? '攻击方' : '防守方'
watch(() => props.modelValue.slots, slots => {
  if (!slots.some(s => slotKey(s) === active.value)) active.value = slots[0] ? slotKey(slots[0]) : ''
}, { immediate: true })

function select(key: string) {
  const [side, index, type] = key.split('-')
  active.value = `${side}-${index}`
  if (type === 'portrait' || type === 'name') kind.value = type
  drawing.value = false
}
function chooseStudent(slot: AnnotationSlot, value: unknown) {
  const next = cloneAnnotation(props.modelValue)
  const target = next.slots.find(s => s.side === slot.side && s.index === slot.index)
  if (target) target.student_id = typeof value === 'number' ? value : null
  emit('update:modelValue', next)
}
function change(key: string, box: AnnotationRegion['box'] | null) {
  emit('update:modelValue', updateRegion(props.modelValue, key, box))
  drawing.value = false
}
function draw(box: AnnotationRegion['box']) { if (activeKey.value) change(activeKey.value, box) }
function crop(box?: AnnotationRegion['box'], maxWidth = 42, maxHeight = 64) {
  if (!box || !props.imageUrl) return {}
  const [x, y, w, h] = box
  const width = Math.min(maxWidth, maxHeight * w / h)
  return { width: `${width}px`, height: `${width * h / w}px`, aspectRatio: `${w}/${h}`, backgroundImage: `url("${props.imageUrl}")`,
    backgroundSize: `${props.detail.width / w * 100}% ${props.detail.height / h * 100}%`,
    backgroundPosition: `${x / Math.max(1, props.detail.width - w) * 100}% ${y / Math.max(1, props.detail.height - h) * 100}%` }
}
</script>

<template>
  <div class="annotation-editor">
    <div class="annotation-columns">
      <section class="annotation-image">
        <div class="area-heading"><h3>战报原图</h3><div class="mode-buttons">
          <ElButton size="small" :type="!drawing ? 'primary' : 'default'" plain :disabled="busy" @click="drawing = false">选择</ElButton>
          <ElButton size="small" :type="drawing ? 'primary' : 'default'" plain :disabled="busy || !selected" @click="drawing = true">框选</ElButton>
        </div></div>
        <LineupAnnotationCanvas v-if="imageUrl" :key="detail.id" :image-url="imageUrl" :width="detail.width" :height="detail.height"
          :regions="regions" :active-key="activeKey" :drawing="drawing" :disabled="busy"
          @select="select" @draw="draw" @change="change" @remove="key => change(key, null)" />
        <div v-else class="image-placeholder" role="status">原图尚未就绪</div>
        <section v-if="selected" class="region-inspector" aria-label="当前标注">
          <h4>当前标注：{{ sideLabel(selected.side) }} {{ selected.index + 1 }} 号位</h4>
          <div class="region-fields">
            <div class="region-crop" :style="crop(activeRegion?.box, 90, 95)"><span v-if="!activeRegion">尚未框选</span></div>
            <label>区域类型<ElSelect v-model="kind" :disabled="busy" aria-label="区域类型"><ElOption label="角色头像" value="portrait" /><ElOption label="角色名字" value="name" /></ElSelect></label>
            <label>角色标签<ElSelect :model-value="selected.student_id" filterable clearable :disabled="busy" aria-label="当前标注角色" placeholder="选择学生" @update:model-value="value => selected && chooseStudent(selected, value)">
              <ElOption v-for="student in catalog" :key="student.id" :label="student.name" :value="student.id" />
            </ElSelect></label>
            <ElButton link type="primary" :disabled="busy" @click="drawing = true">{{ activeRegion ? '重新框选' : '开始框选' }}</ElButton>
          </div>
        </section>
        <p v-else class="annotation-empty">先在右侧填写已有阵容的人数，再选择位置并框选原图。</p>
      </section>
      <section class="annotation-lineups">
        <div class="area-heading"><h3>阵容纠错</h3><span>点击角色可定位原图</span></div>
        <div class="teams">
          <section v-for="side in (['attack', 'defense'] as const)" :key="side" class="team">
            <header><h4>{{ sideLabel(side) }}</h4><ElSelect :model-value="modelValue.teams[side] || 0" :disabled="busy" :aria-label="`${sideLabel(side)}人数`" size="small" @update:model-value="count => emit('update:modelValue', resizeTeam(modelValue, side, Number(count)))">
              <ElOption label="未提供" :value="0" /><ElOption v-for="count in 6" :key="count" :label="`${count} 人`" :value="count" />
            </ElSelect></header>
            <p v-if="!modelValue.teams[side]" class="annotation-empty">未提供该侧阵容</p>
            <div v-for="slot in modelValue.slots.filter(s => s.side === side)" :key="slotKey(slot)" class="student-row" :class="{ active: active === slotKey(slot) }">
              <button class="slot-button" :aria-label="`定位${sideLabel(side)}${slot.index + 1}号位`" :disabled="busy" @click="select(`${slotKey(slot)}-${slot.regions[0]?.kind || kind}`)">
                <span>{{ slot.index + 1 }}</span><span class="slot-crop" :style="crop(slot.regions[0]?.box)"><span v-if="!slot.regions.length">＋</span></span>
              </button>
              <div class="student-control">
                <ElSelect :model-value="slot.student_id" filterable clearable :disabled="busy" :aria-label="`${sideLabel(side)}${slot.index + 1}号位学生`" placeholder="选择学生" @focus="active = slotKey(slot)" @update:model-value="value => chooseStudent(slot, value)">
                  <ElOption v-for="student in catalog" :key="student.id" :label="student.name" :value="student.id" />
                </ElSelect>
                <span v-if="!slot.student_id || !slot.regions.length" class="pending">{{ !slot.student_id ? '待选择学生' : '待框选区域' }}</span>
              </div>
            </div>
          </section>
        </div>
        <details class="recognition-evidence">
          <summary>识别详情</summary>
          <p v-if="detail.error_code" class="pending">原识别失败：{{ detail.error_code }}</p>
          <p v-if="!detail.result">此图片没有机器识别结果，可直接在原图上进行标注。</p>
          <div v-for="slot in detail.result?.slots.filter(s => s.present !== false) || []" :key="`${slot.side}-${slot.index}`" class="evidence-row">
            <strong>{{ sideLabel(slot.side) }} {{ slot.index + 1 }}</strong>
            <span>OCR：{{ slot.ocr_text || '未识别' }} · 头像 {{ slot.score.toFixed(3) }} · 分差 {{ slot.margin.toFixed(3) }}</span>
            <div class="candidate-buttons"><ElButton v-if="slot.image_id" link size="small" :disabled="busy" @click="modelValue.slots.find(s => s.side === slot.side && s.index === slot.index) && chooseStudent(modelValue.slots.find(s => s.side === slot.side && s.index === slot.index)!, slot.image_id)">图像候选：{{ students.get(slot.image_id) || slot.image_id }}</ElButton>
              <ElButton v-if="slot.ocr_id" link size="small" :disabled="busy" @click="modelValue.slots.find(s => s.side === slot.side && s.index === slot.index) && chooseStudent(modelValue.slots.find(s => s.side === slot.side && s.index === slot.index)!, slot.ocr_id)">文字候选：{{ students.get(slot.ocr_id) || slot.ocr_id }}</ElButton></div>
          </div>
        </details>
      </section>
    </div>
    <footer class="annotation-actions"><div><ElButton :disabled="busy || !dirty" @click="emit('reset')">重置修改</ElButton><ElButton :disabled="busy || dirty || !detail.annotation" @click="emit('export')">导出标注</ElButton></div>
      <ElButton type="primary" :loading="busy" :disabled="!dirty && !!detail.annotation" @click="emit('save')">保存纠错与标注</ElButton>
    </footer>
  </div>
</template>

<style scoped>
.annotation-editor { min-width:0; display:grid; gap:14px; }
.annotation-columns { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); gap:14px; align-items:start; }
.annotation-image,.annotation-lineups { min-width:0; border:1px solid var(--border); border-radius:9px; padding:12px; }
.annotation-image :deep(.lineup-annotation-editor) { padding:0; border:0; }
.area-heading,.annotation-actions,.team header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.area-heading { margin-bottom:10px; flex-wrap:wrap; }
h3,h4 { margin:0; }
h3 { font-size:16px; } h4 { font-size:14px; }
.area-heading>span,.region-fields label,.annotation-empty { color:var(--muted); font-size:12px; }
.mode-buttons { display:flex; gap:4px; }
.mode-buttons :deep(.el-button + .el-button) { margin-left:0; }
.teams { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.team { border:1px solid var(--border); border-radius:8px; padding:9px; min-width:0; }
.team header { margin-bottom:8px; flex-wrap:wrap; }
.team header :deep(.el-select) { width:85px; }
.student-row { display:flex; align-items:center; gap:7px; padding:7px 3px; border-radius:8px; min-width:0; margin-bottom:4px; }
.student-row.active { background:var(--el-color-primary-light-9); }
.slot-button { border:0; background:none; color:var(--text); display:flex; align-items:center; gap:6px; padding:0; cursor:pointer; flex:none; }
.slot-crop { display:grid; place-items:center; width:42px; height:42px; background-color:var(--surface-soft); background-repeat:no-repeat; border-radius:6px; flex:none; }
.student-control { min-width:0; flex:1; display:grid; gap:3px; }
.student-control :deep(.el-input__wrapper),.student-control :deep(.el-select__wrapper) { padding-left:7px; padding-right:7px; }
.pending { color:var(--warning,#c78119); font-size:11px; }
.region-inspector { padding:12px; margin-top:10px; border:1px solid var(--border); border-radius:8px; }
.region-fields { margin-top:10px; display:grid; grid-template-columns:90px minmax(100px,.8fr) minmax(120px,1fr) auto; align-items:center; gap:10px; }
.region-fields label { display:grid; gap:6px; }
.region-crop { display:grid; place-items:center; width:90px; height:74px; background-repeat:no-repeat; background-color:var(--surface-soft); border-radius:6px; font-size:12px; color:var(--muted); }
.recognition-evidence { margin-top:12px; border:1px solid var(--border); border-radius:8px; padding:12px; font-size:12px; }
.recognition-evidence summary { cursor:pointer; font-weight:600; }
.evidence-row { display:grid; gap:5px; padding-top:10px; overflow-wrap:anywhere; }
.candidate-buttons { display:flex; flex-wrap:wrap; gap:5px; }
.image-placeholder { display:grid; min-height:240px; place-items:center; color:var(--muted); background:var(--surface-soft); }
.annotation-actions { flex-wrap:wrap; border-top:1px solid var(--border); padding-top:12px; padding-bottom:5px; background:var(--surface); }
@media(max-width:1350px) { .annotation-columns { grid-template-columns:1fr; } }
@media(max-width:640px) { .teams { grid-template-columns:1fr; } .region-fields { grid-template-columns:74px minmax(0,1fr); } .region-fields label:last-of-type,.region-fields > :deep(.el-button) { grid-column:1/-1; } .region-fields > :deep(.el-button) { justify-self:start; } .annotation-actions { align-items:stretch; } .annotation-actions>div { display:flex; flex-wrap:wrap; gap:6px; } }
</style>
