<script setup lang="ts">
import HelpHint from '../../shared/ui/HelpHint.vue'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElMessage, ElOption, ElSelect } from 'element-plus'
import { ref, watch } from 'vue'

import {
  createRegistrationGrant,
  type RegistrationGrant,
  type Terminal,
} from '../../shared/api/terminals'
import { formatDateTime } from '../../shared/presentation/format'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  targetDevice?: { device_id: string; display_name: string } | null
}>()

const terminalType = ref<Terminal['terminal_type'] | 'any'>('any')
const ttlSeconds = ref(900)
const loading = ref(false)
const grant = ref<RegistrationGrant | null>(null)

watch(visible, (isVisible) => {
  if (!isVisible) {
    grant.value = null
    terminalType.value = 'any'
  } else if (props.targetDevice) {
    terminalType.value = 'android'
  }
})

async function issueGrant(): Promise<void> {
  loading.value = true
  try {
    grant.value = await createRegistrationGrant(
      terminalType.value === 'any' ? null : terminalType.value,
      ttlSeconds.value,
      props.targetDevice?.device_id ?? null,
    )
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '注册码创建失败')
  } finally {
    loading.value = false
  }
}

async function copyCode(): Promise<void> {
  if (!grant.value) return
  try {
    await navigator.clipboard.writeText(grant.value.registration_code)
    ElMessage.success('注册码已复制')
  } catch {
    ElMessage.error('无法访问剪贴板，请手动复制注册码')
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="props.targetDevice ? '绑定 Android APK' : '创建终端注册码'"
    width="min(520px, calc(100vw - 28px))"
    destroy-on-close
  >
    <div v-if="!grant" class="grant-form">
      <div v-if="props.targetDevice" class="target-binding-note">
        <span>绑定逻辑手机 <HelpHint subject="绑定逻辑手机">注册只绑定 APK 身份；如果手机当前由 Linux 终端挂载，不会自动切换执行主体。</HelpHint></span>
        <strong>{{ props.targetDevice.display_name }}</strong>
        <code>{{ props.targetDevice.device_id }}</code>
        
      </div>
      <label v-else>
        <span>允许注册的终端类型</span>
        <ElSelect v-model="terminalType">
          <ElOption label="Linux 或 Android" value="any" />
          <ElOption label="仅 Linux" value="linux" />
          <ElOption label="仅 Android" value="android" />
        </ElSelect>
      </label>
      <label>
        <span>有效期 <HelpHint subject="注册码有效期">注册码仅在创建成功后显示一次；终端注册成功后立即失效。</HelpHint></span>
        <ElSelect v-model="ttlSeconds">
          <ElOption label="15 分钟" :value="900" />
          <ElOption label="1 小时" :value="3600" />
          <ElOption label="24 小时" :value="86400" />
        </ElSelect>
      </label>
      
    </div>

    <div v-else class="grant-result">
      <p>请在终端部署流程中使用以下一次性注册码：</p>
      <code>{{ grant.registration_code }}</code>
      <div><span>失效时间</span><strong>{{ formatDateTime(grant.expires_at) }}</strong></div>
      <ElButton :icon="CopyDocument" @click="copyCode">复制注册码</ElButton>
    </div>

    <template #footer>
      <ElButton @click="visible = false">关闭</ElButton>
      <ElButton v-if="!grant" type="primary" :loading="loading" @click="issueGrant">生成注册码</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.target-binding-note {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-light);
}

.target-binding-note code {
  overflow-wrap: anywhere;
}

.target-binding-note p {
  margin: 0;
  color: var(--el-text-color-secondary);
}
</style>
