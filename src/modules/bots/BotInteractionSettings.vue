<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BotService } from '../../shared/api/bots'
import MemeConnectionSettings from './memes/MemeConnectionSettings.vue'
import MemeRateLimits from './memes/MemeRateLimits.vue'
const props = defineProps<{ kind: 'qq' | 'discord'; service: BotService | null }>()
const connection = ref<InstanceType<typeof MemeConnectionSettings> | null>(null)
const rates = ref<InstanceType<typeof MemeRateLimits> | null>(null)
const status = computed(() => {
  if (connection.value?.busy || rates.value?.busy) return '保存中…'
  if (connection.value?.error || rates.value?.error) return '请核对错误'
  if (connection.value?.dirty || rates.value?.dirty) return '有未保存修改'
  if (!props.service) return '未选择连接'
  if (!connection.value?.hasLoaded || !rates.value?.hasLoaded) return '正在读取…'
  return connection.value.hasSaved ? '已保存' : '默认设置，尚未保存'
})
defineExpose({ status, savedEnabled: computed(() => connection.value?.savedEnabled ?? null) })
</script>
<template>
  <div class="bot-interaction-settings">
    <div class="bot-panel-feedback" :class="{ saved: status === '已保存' }" role="status">{{ status === '已保存' ? '✓ ' : '' }}{{ status }}</div>
    <MemeConnectionSettings v-if="service" :key="service.service_id" ref="connection" :service-id="service.service_id" :kind="kind" :connection-name="service.name" expanded console-mode />
    <p v-else class="bot-console-empty">请选择或新建连接，再配置互动表情的使用范围。</p>
    <MemeRateLimits :key="kind" ref="rates" :platform="kind" console-mode />
  </div>
</template>
