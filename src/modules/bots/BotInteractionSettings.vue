<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { BotService } from '../../shared/api/bots'
import MemeConnectionSettings from './memes/MemeConnectionSettings.vue'
import MemeRateLimits from './memes/MemeRateLimits.vue'
const props = defineProps<{ kind: 'qq' | 'discord'; service: BotService | null }>()
const connection = ref<InstanceType<typeof MemeConnectionSettings> | null>(null)
const rates = ref<InstanceType<typeof MemeRateLimits> | null>(null)
const saving = ref(false)
const status = computed(() => {
  if (saving.value || connection.value?.busy || rates.value?.busy) return '保存中…'
  if (connection.value?.error || rates.value?.error) return '请核对错误'
  if (connection.value?.dirty || rates.value?.dirty) return '有未保存修改'
  if (!props.service) return '未选择连接'
  if (!connection.value?.hasLoaded || !rates.value?.hasLoaded) return '正在读取…'
  return connection.value.hasSaved ? '已保存' : '默认设置，尚未保存'
})
async function saveAll() {
  const settings = connection.value, limits = rates.value
  if (!settings || !limits || saving.value || settings.busy || limits.busy) return
  const saveSettings = settings.dirty || !settings.hasSaved || Boolean(settings.error)
  const saveLimits = limits.dirty || Boolean(limits.error)
  if (saveLimits && !limits.validate()) return
  if (!saveSettings && !saveLimits) { ElMessage.success('设置已保存。'); return }
  saving.value = true
  try {
    if (saveSettings && !await settings.save()) return
    if (connection.value !== settings || rates.value !== limits) return
    if (saveLimits) {
      const saved = await limits.saveCurrent()
      if (connection.value !== settings || rates.value !== limits) return
      if (!saved) {
        if (saveSettings) ElMessage.warning('连接设置已保存，平台发送间隔未保存，请检查错误后重试。')
        return
      }
    }
    ElMessage.success(saveSettings ? '设置已保存，表情服务将在30秒内刷新。' : '平台发送间隔已保存。')
  } finally { saving.value = false }
}
defineExpose({ status, savedEnabled: computed(() => connection.value?.savedEnabled ?? null) })
</script>
<template>
  <div class="bot-interaction-settings">
    <div v-if="status !== '已保存'" class="bot-panel-feedback" role="status">{{ status }}</div>
    <MemeConnectionSettings v-if="service" :key="service.service_id" ref="connection" :service-id="service.service_id" :kind="kind" :saving="saving" :save-disabled="!rates?.hasLoaded || rates?.busy" expanded console-mode @save-all="saveAll">
      <MemeRateLimits :key="kind" ref="rates" :platform="kind" console-mode />
    </MemeConnectionSettings>
    <p v-else class="bot-console-empty">请选择或新建连接，再配置互动表情的使用范围。</p>
  </div>
</template>

<style scoped>
.bot-interaction-settings { display:flex; flex-wrap:wrap; align-items:flex-start; gap:18px; min-width:0; padding:18px clamp(16px,2vw,26px) 26px; container:interaction-settings / inline-size; }
.bot-interaction-settings .bot-panel-feedback { position:static; flex:1 0 100%; margin:0; text-align:right; line-height:18px; }
</style>
