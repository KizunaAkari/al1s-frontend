<script setup lang="ts">
import { ref } from 'vue'
import { Message, CircleCheck, Tickets } from '@element-plus/icons-vue'
import BotBrandIcon from '../../shared/components/BotBrandIcon.vue'
import NotificationChannels from './NotificationChannels.vue'
import NotificationTests from './NotificationTests.vue'
import UnifiedNotificationRules from './UnifiedNotificationRules.vue'
import NotificationRecords from './NotificationRecords.vue'
import MessageReviews from './MessageReviews.vue'
import LexiconSettings from './LexiconSettings.vue'
import ForwardFailures from './ForwardFailures.vue'
import './notification-settings.css'

const tabs = [
  { id: 'smtp', label: 'SMTP 邮件' },
  { id: 'qq', label: 'QQ Bot' },
  { id: 'discord', label: 'Discord Bot' },
] as const
type Tab = typeof tabs[number]['id'] | 'reviews' | 'records'
const active = ref<Tab>('smtp')
const visited = ref(new Set<Tab>(['smtp']))
const revisions = ref({ smtp: 0, qq: 0, discord: 0 })
function select(tab: Tab) { active.value = tab; visited.value.add(tab) }
</script>

<template>
  <section class="notification-settings">
    <header class="notification-heading">
      <div><h1>通知设置 </h1></div>
      <span class="notification-heading-label">通知与消息</span>
    </header>
    <nav class="notification-tabs" aria-label="通知设置分类">
      <button v-for="tab in tabs" :key="tab.id" :class="{ active: active === tab.id }"
        :aria-pressed="active === tab.id" @click="select(tab.id)">
        <span class="notification-tab-icon" aria-hidden="true">
          <Message v-if="tab.id === 'smtp'" />
          <BotBrandIcon v-else :kind="tab.id" />
        </span>
        {{ tab.label }}
      </button>
      <button class="notification-tab-divider" :class="{ active: active === 'reviews' }"
        :aria-pressed="active === 'reviews'" @click="select('reviews')"><span class="notification-tab-icon" aria-hidden="true"><CircleCheck /></span>消息审核</button>
      <button :class="{ active: active === 'records' }" :aria-pressed="active === 'records'"
        @click="select('records')"><span class="notification-tab-icon" aria-hidden="true"><Tickets /></span>投递记录</button>
    </nav>
    <template v-for="tab in tabs" :key="tab.id">
      <div v-if="visited.has(tab.id)" v-show="active === tab.id">
        <header class="notification-channel-heading"><h2>{{ tab.label }} </h2></header>
        <div class="notification-channel-grid">
          <NotificationChannels :kind="tab.id" @changed="revisions[tab.id]++" />
          <NotificationTests :kind="tab.id" :revision="revisions[tab.id]" />
        </div>
      </div>
    </template>
    <UnifiedNotificationRules v-show="active === 'smtp' || active === 'qq' || active === 'discord'" :revision="revisions.smtp + revisions.qq + revisions.discord" />
    <div v-if="visited.has('reviews')" v-show="active === 'reviews'" class="notification-shared-panels">
      <MessageReviews class="notification-card" /><LexiconSettings class="notification-card" />
    </div>
    <div v-if="visited.has('records')" v-show="active === 'records'" class="notification-shared-panels">
      <NotificationRecords class="notification-card" /><ForwardFailures class="notification-card" />
    </div>
  </section>
</template>
