<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'
import BotOnlineStatus from './BotOnlineStatus.vue'
import type { BotService } from '../../shared/api/bots'
import type { BotRuntimeStatus } from '../../shared/api/bot-runtime'
import { botContainerLabel, botHealthLabel, formatBotClock, type BotContainerState } from './bot-console-model'
const props = defineProps<{ kind: 'qq' | 'discord'; services: BotService[]; serviceId: string | null;
  containerState: BotContainerState | null; busy?: boolean; refreshing?: boolean; more?: boolean }>()
const emit = defineEmits<{ select: [id: string]; create: []; refresh: []; more: []; status: [value: BotRuntimeStatus | null] }>()
const current = computed(() => props.services.find(service => service.service_id === props.serviceId))
const observed = ref<BotRuntimeStatus | null>(null)
const online = ref<InstanceType<typeof BotOnlineStatus> | null>(null)
function update(value: BotRuntimeStatus | null) {
  if (value && value.service_id !== props.serviceId) return
  observed.value = value; emit('status', value)
}
watch(() => props.serviceId, () => update(null))
defineExpose({ refresh: () => online.value?.refresh() })
</script>
<template>
  <section class="bot-console-status" aria-label="当前Bot连接与状态">
    <div class="bot-console-identity">
      <BotBrandIcon :kind="kind" />
      <div>
        <ElSelect :model-value="serviceId ?? undefined" aria-label="当前连接" placeholder="选择连接" :disabled="busy"
          @update:model-value="value => emit('select', String(value))">
          <ElOption v-for="service in services" :key="service.service_id" :label="service.name" :value="service.service_id" />
        </ElSelect>
        <div class="bot-console-identity-meta"><span>{{ !current?.desired_config_version_id ? '尚未配置' : current.desired_config_version_id === current.applied_config_version_id ? '配置已应用' : '配置待应用' }}</span>
          <span class="bot-pill">{{ kind === 'qq' ? 'LLOneBot' : 'Discord Worker' }}</span></div>
      </div>
      <button v-if="more" type="button" class="bot-console-more" :disabled="busy" @click="emit('more')">加载更多</button>
    </div>
    <div class="bot-console-live">
      <BotOnlineStatus v-if="serviceId" :key="serviceId" ref="online" :service-id="serviceId" compact @status="update" />
      <strong v-else class="bot-console-muted">尚未选择账号连接</strong>
      <div class="bot-console-container-facts"><span>容器：<b :class="{ good: containerState?.running }">{{ botContainerLabel(containerState) }}</b></span>
        <span>健康：<b :class="{ good: containerState?.health === 'healthy', bad: containerState?.health === 'unhealthy' }">{{ botHealthLabel(containerState) }}</b></span></div>
    </div>
    <div class="bot-console-toolbar"><div><span>账号检测</span><time :datetime="observed?.observed_at || observed?.checked_at || undefined">{{ formatBotClock(observed?.observed_at || observed?.checked_at) }}</time></div>
      <ElButton :disabled="busy || refreshing" aria-label="刷新Bot状态" @click="emit('refresh')">⟳</ElButton>
      <ElButton type="primary" :disabled="busy" @click="emit('create')">＋ 新建连接</ElButton></div>
  </section>
</template>
