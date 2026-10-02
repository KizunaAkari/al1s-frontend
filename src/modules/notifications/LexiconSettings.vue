<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElDescriptions, ElDescriptionsItem } from 'element-plus'
import { apiClient } from '../../shared/api/client'

type Version = { available: boolean; source: string; commit: string | null; sha256: string | null; normalization_version: string | null; word_count: number; updated_at: string | null }
const version = ref<Version>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
async function refresh() {
  version.value = (await apiClient.get<Version>('/notifications/lexicon')).data
}
async function run(update = false) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (update) {
      const result = await apiClient.post<{ changed: boolean }>('/notifications/lexicon/update', {}, { timeout: 70_000 })
      notice.value = result.data.changed ? '词库已更新' : '当前已是该版本'
    }
    await refresh()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '词库操作失败' }
  finally { busy.value = false }
}
onMounted(() => run())
</script>
<template>
  <section>
    <h2>敏感词库 <HelpHint subject="敏感词库">仅更新固定上游数据，不执行上游程序；更新失败保留旧版，不重新判断已审核消息。</HelpHint></h2>
    
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <el-descriptions v-if="version" :column="1" border>
      <el-descriptions-item label="状态">{{ version.available ? '可用' : '未安装，转发需暂存' }}</el-descriptions-item>
      <el-descriptions-item label="来源">{{ version.source }}</el-descriptions-item>
      <el-descriptions-item label="Commit">{{ version.commit ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="SHA-256">{{ version.sha256 ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="规范化">{{ version.normalization_version ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="词条数">{{ version.word_count }}</el-descriptions-item>
      <el-descriptions-item label="更新时间">{{ version.updated_at ?? '—' }}</el-descriptions-item>
    </el-descriptions>
    <el-button :disabled="busy" @click="run()">刷新</el-button>
    <el-button type="primary" :loading="busy" @click="run(true)">更新词库</el-button>
  </section>
</template>
