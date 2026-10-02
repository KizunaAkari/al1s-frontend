<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElForm, ElInput } from 'element-plus'
import { apiClient } from '../../shared/api/client'
import { loginErrorMessage } from './loginErrors'
import ThemeMenu from '../../shared/ui/ThemeMenu.vue'
import BrandLogo from '../../shared/ui/BrandLogo.vue'
import background from '../../assets/backgrounds/login-coast.png'
const backgroundSrc = ref('/api/v1/appearance/login-background')
function backgroundFallback() { backgroundSrc.value = background }
const password = ref('')
const busy = ref(false)
const error = ref('')
const route = useRoute()
const router = useRouter()
async function login() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await apiClient.post('/auth/login', { password: password.value })
    password.value = ''
    const next = route.query.next
    await router.replace(typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/')
  } catch (cause) { error.value = loginErrorMessage(cause) }
  finally { busy.value = false }
}
</script>
<template>
  <main class="login-page">
    <img class="login-background" :src="backgroundSrc" alt="" @error="backgroundFallback" />
    <div class="login-shade" aria-hidden="true" />
    <header class="login-header"><BrandLogo light /><ThemeMenu /></header>
    <section class="login-card" aria-labelledby="login-title">
      <h1 id="login-title">欢迎回来</h1>
      <ElForm @submit.prevent="login">
        <ElInput v-model="password" type="password" show-password autocomplete="current-password"
          placeholder="输入密码" aria-label="密码" :disabled="busy" maxlength="4096"
          :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" />
        <p v-if="error" id="login-error" class="login-error" role="alert">{{ error }}</p>
        <ElButton class="login-submit" native-type="submit" type="primary" :loading="busy">登录 →</ElButton>
      </ElForm>
    </section>
  </main>
</template>
