<script setup lang="ts">
import { computed } from 'vue'
import type { AttemptDetail } from '../../shared/api/task-details'
import { quickTestFailureLines, quickTestFailureReason } from '../maa/editor/quick-test-failure'

const props = defineProps<{ attempt: AttemptDetail }>()
const reasons = computed(() => props.attempt.recognition_failures ?? [])
const contexts = computed(() => props.attempt.failure_contexts ?? [])
function seconds(value: number) { return Number(value.toFixed(3)) }
const phase = computed(() => ({ delivery: '任务下发', runtime: '运行时', cleanup: '执行收尾', platform: '平台处理' }[props.attempt.failure_phase || ''] || '执行'))
const title = computed(() => quickTestFailureReason(props.attempt.error_code || '').replace('本次测试', '本次任务').replace('测试执行失败', '任务执行失败'))
</script>
<template>
  <section class="failure-explanation" aria-label="执行失败原因">
    <template v-if="!attempt.confirmed && !attempt.expired">
      <h4>{{ title }}</h4>
      <div v-for="(detail, index) in reasons" :key="index" class="recognition-evidence">
        <strong>组合第 {{ detail.module_number }} 步</strong>
        <p v-for="(line, number) in quickTestFailureLines(detail)" :key="number">{{ line }}</p>
      </div>
      <template v-if="!reasons.length">
        <div v-for="(context, index) in contexts" :key="index" class="recognition-evidence">
          <strong>组合第 {{ context.module_number }} 步</strong>
          <p>脚本“{{ context.script_name }}” · <template v-if="context.rule_name">00 · 全局规则“{{ context.rule_name }}”（关联主步骤 {{ context.step_number }}）</template><template v-else-if="context.step_number != null">第 {{ context.step_number }} 步</template><template v-else>终端未上报步骤号</template></p>
          <p v-if="context.timeout_seconds != null || context.elapsed_seconds != null"><span v-if="context.timeout_seconds != null">时间预算 {{ seconds(context.timeout_seconds) }} 秒</span><template v-if="context.timeout_seconds != null && context.elapsed_seconds != null"> · </template><span v-if="context.elapsed_seconds != null">已用 {{ seconds(context.elapsed_seconds) }} 秒</span></p>
        </div>
        <p v-if="!contexts.length" class="missing-evidence">未收到可用的详细诊断，无法仅凭错误码确定具体原因。请结合失败截图和下方已有记录核对。</p>
      </template>
    </template>
    <details v-if="attempt.error_code" class="failure-technical">
      <summary>技术信息</summary>
      <p>失败阶段：{{ phase }}</p><code>{{ attempt.error_code }}</code>
    </details>
  </section>
</template>
<style scoped>
.failure-explanation { display:grid; gap:8px; margin:8px 0 12px; }
h4 { margin:0; font-size:14px; color:var(--el-color-danger); }
.recognition-evidence { display:grid; gap:4px; padding:10px 12px; border-left:3px solid var(--el-color-danger); border-radius:4px; background:var(--el-color-danger-light-9); }
.recognition-evidence strong { font-size:12px; }.recognition-evidence p { margin:0; font-size:13px; line-height:1.5; }
.missing-evidence { margin:0; font-size:12px; color:var(--el-text-color-secondary); }
.failure-technical { font-size:12px; color:var(--el-text-color-secondary); }.failure-technical summary { cursor:pointer; }
</style>
