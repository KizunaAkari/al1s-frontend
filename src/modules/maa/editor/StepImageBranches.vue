<script setup lang="ts">
import HelpHint from '../../../shared/ui/HelpHint.vue'
import StepRegionField from './StepRegionField.vue'
import { computed } from 'vue'
import {
  ElAlert,
  ElButton,
  ElInput,
  ElInputNumber,
  ElMessageBox,
  ElOption,
  ElSelect,
} from 'element-plus'
import type { ScriptDocument } from '../../../shared/api/maa-script-editor'

type ImageBranch = Record<string, unknown>

const props = defineProps<{
  document: ScriptDocument
  index: number
  selected?: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  change: [document: ScriptDocument]
  select: [value: number | undefined]
}>()

const step = computed(() => props.document.steps[props.index])
const isWaitClick = computed(() => step.value?.action === 'wait_click')
const parentClickMode = computed(() => {
  const value = step.value?.click_mode
  return typeof value === 'string' && value.length > 0 ? value : 'fixed'
})
const parentModeBlocksBranches = computed(() => ['match_offset', 'color_marker'].includes(parentClickMode.value))
const editableStep = computed(() => isWaitClick.value && !parentModeBlocksBranches.value)
const canEdit = computed(() => editableStep.value && !props.disabled)

const imageBranchesValue = computed(() => step.value?.image_branches)
const branchListIsUsable = computed(() => {
  const value = imageBranchesValue.value
  return value === undefined || value === null || Array.isArray(value)
})
const rawBranches = computed<unknown[]>(() => {
  const value = imageBranchesValue.value
  return Array.isArray(value) ? value : []
})
const branchRows = computed(() => rawBranches.value.map((value, index) => ({
  index,
  branch: isRecord(value) ? value : undefined,
})))
const hasHistoricalBranches = computed(() => {
  const value = imageBranchesValue.value
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null
})
const canAdd = computed(() => canEdit.value && branchListIsUsable.value && rawBranches.value.length < 20)

function isRecord(value: unknown): value is ImageBranch {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function branchText(branch: ImageBranch | undefined, key: string, fallback = '') {
  return typeof branch?.[key] === 'string' ? branch[key] as string : fallback
}

function branchNumber(branch: ImageBranch | undefined, key: string, fallback?: number) {
  const value = branch?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function branchMode(branch: ImageBranch | undefined) {
  const value = branch?.click_mode
  return typeof value === 'string' && value.length > 0 ? value : 'match_center'
}

function hasTemplate(branch: ImageBranch | undefined) {
  const value = branch?.template_base64
  if (typeof value === 'string') return value.trim().length > 0
  return isRecord(value) && typeof value.$blob === 'string' && value.$blob.length > 0
}

function branchListForEdit() {
  const value = imageBranchesValue.value
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? [...value] : undefined
}

function emitWithBranches(branches: unknown[]) {
  const currentStep = step.value
  if (!currentStep) return false
  const steps = props.document.steps.map((item, index) => (
    index === props.index ? { ...currentStep, image_branches: branches } : item
  ))
  emit('change', { ...props.document, steps })
  return true
}

function updateBranch(index: number, key: string, value: unknown) {
  if (!canEdit.value) return
  const branches = branchListForEdit()
  const branch = branches?.[index]
  if (!branches || !isRecord(branch)) return
  const nextBranch = { ...branch }
  if (value === undefined || value === null) delete nextBranch[key]
  else nextBranch[key] = value
  branches[index] = nextBranch
  emitWithBranches(branches)
}

function nextBranchName(branches: unknown[]) {
  const names = new Set(branches.map(value => isRecord(value) ? value.name : undefined))
  let number = branches.length + 1
  while (names.has('图片分支 ' + number)) number += 1
  return '图片分支 ' + number
}

function addBranch() {
  if (!canAdd.value) return
  const branches = branchListForEdit()
  if (!branches || branches.length >= 20) return
  branches.push({
    id: crypto.randomUUID(),
    name: nextBranchName(branches),
    threshold: 0.85,
    click_mode: 'match_center',
  })
  emitWithBranches(branches)
}

async function removeBranch(index: number) {
  if (!canEdit.value) return
  const beforeConfirm = branchListForEdit()
  if (!beforeConfirm || index < 0 || index >= beforeConfirm.length) return
  const targetDocument = props.document
  const targetIndex = props.index
  const targetBranch = beforeConfirm[index]
  try {
    await ElMessageBox.confirm(
      '删除后将移除这个 wait_click 替代识别入口，是否继续？',
      '确认删除图片分支',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  if (!canEdit.value || props.document !== targetDocument || props.index !== targetIndex) return
  const currentBranches = props.document.steps[targetIndex]?.image_branches
  if (!Array.isArray(currentBranches) || currentBranches[index] !== targetBranch) return
  const branches = [...currentBranches]
  if (emitWithBranches(branches.filter((_, branchIndex) => branchIndex !== index))) {
    emit('select', undefined)
  }
}

</script>

<template>
  <section class="image-branches" aria-label="wait_click 图片分支">
    <div class="heading">
      <strong>图片分支 <HelpHint subject="图片分支">图片分支是当前 wait_click 的替代识别入口，按执行器顺序尝试；它不是跳转到其他步骤。</HelpHint></strong>
      
    </div>

    <ElAlert
      v-if="!step"
      type="error"
      :closable="false"
      title="当前步骤不存在，未修改任何图片分支。"
    />
    <template v-else-if="!editableStep">
      <ElAlert
        v-if="hasHistoricalBranches"
        type="warning"
        :closable="false"
        :title="parentModeBlocksBranches
          ? '当前 click_mode 不支持图片分支编辑；已有历史分支已保留，未修改。'
          : '当前动作不支持图片分支编辑；已有历史分支已保留，未修改。'"
      />
      <ElAlert
        v-else
        type="info"
        :closable="false"
        title="图片分支仅适用于 wait_click；当前步骤未修改。"
      />
    </template>
    <template v-else>
      <ElAlert
        v-if="!branchListIsUsable"
        type="warning"
        :closable="false"
        title="现有 image_branches 不是可编辑列表，原值已保留。"
      />


      <p v-if="branchRows.length === 0" class="empty">尚未添加图片分支。</p>
      <article v-for="row in branchRows" :key="row.index" class="branch">
        <div class="branch-heading">
          <strong>图片分支 {{ row.index + 1 }}</strong>
          <ElButton
            text
            type="danger"
            :disabled="!canEdit || !row.branch"
            :aria-label="'删除图片分支 ' + (row.index + 1)"
            @click="removeBranch(row.index)"
          >
            删除
          </ElButton>
        </div>

        <ElAlert
          v-if="!row.branch"
          type="warning"
          :closable="false"
          title="这个历史分支格式无法编辑，原值已保留。"
        />
        <template v-else>
          <ElAlert
            v-if="!hasTemplate(row.branch)"
            type="warning"
            :closable="false"
            title="缺少分支模板，请在本分支内截图选区。"
          />
          <label>
            分支名称
            <ElInput
              :model-value="branchText(row.branch, 'name', '图片分支 ' + (row.index + 1))"
              maxlength="200"
              show-word-limit
              :disabled="!canEdit"
              :aria-label="'图片分支 ' + (row.index + 1) + ' 名称'"
              @input="value => updateBranch(row.index, 'name', value)"
            />
          </label>
          <label>
            匹配阈值
            <ElInputNumber
              :model-value="branchNumber(row.branch, 'threshold', 0.85)"
              :min="0.000001"
              :max="1"
              :step="0.01"
              :precision="6"
              :disabled="!canEdit"
              :aria-label="'图片分支 ' + (row.index + 1) + ' 匹配阈值'"
              @change="value => updateBranch(row.index, 'threshold', value)"
            />
          </label>
          <label>
            点击模式
            <ElSelect
              :model-value="branchMode(row.branch)"
              :disabled="!canEdit"
              :aria-label="'图片分支 ' + (row.index + 1) + ' 点击模式'"
              @change="value => updateBranch(row.index, 'click_mode', value)"
            >
              <ElOption label="匹配中心" value="match_center" />
              <ElOption label="图片点击" value="image" />
              <ElOption
                v-if="!['match_center', 'image'].includes(branchMode(row.branch))"
                :label="'保留现有模式：' + branchMode(row.branch)"
                :value="branchMode(row.branch)"
                disabled
              />
            </ElSelect>
          </label>
          <label v-if="branchMode(row.branch) === 'image'">
            点击阈值（可选）
            <ElInputNumber
              :model-value="branchNumber(row.branch, 'click_threshold')"
              :min="0.000001"
              :max="1"
              :step="0.01"
              :precision="6"
              :disabled="!canEdit"
              :aria-label="'图片分支 ' + (row.index + 1) + ' 点击阈值'"
              @change="value => updateBranch(row.index, 'click_threshold', value)"
            />
          </label>
          <StepRegionField use="template" :title="`分支 ${row.index + 1} 识别图片`" :bound="row.branch.template_base64" :branch-index="row.index" />
          <StepRegionField v-if="branchMode(row.branch) === 'image'" use="click" :title="`分支 ${row.index + 1} 点击图片`" :bound="row.branch.click_template_base64" :branch-index="row.index" />
        </template>
      </article>

      <ElButton
        :disabled="!canAdd"
        aria-label="新增图片分支"
        @click="addBranch"
      >
        新增图片分支
      </ElButton>
      <p v-if="rawBranches.length >= 20" class="limit">图片分支最多 20 个。</p>
    </template>
  </section>
</template>

<style scoped>
.image-branches { display: grid; gap: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; padding: 16px; }
.heading, .branch-heading, .target-row { display: flex; align-items: center; gap: 10px; }
.heading, .branch-heading { justify-content: space-between; }
.heading p, .target-row span, .empty, .limit { color: var(--el-text-color-secondary); margin: 0; }
.branch { display: grid; gap: 10px; border: 1px solid var(--el-border-color-light); border-radius: 8px; padding: 12px; }
label { display: grid; gap: 6px; }
</style>
