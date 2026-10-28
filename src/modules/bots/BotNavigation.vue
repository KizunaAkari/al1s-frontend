<script setup lang="ts">
import { computed, ref } from 'vue'
import { Setting, VideoPlay, Document, MagicStick, Search, DataAnalysis } from '@element-plus/icons-vue'
import { botPanels, type BotPanel } from './bot-console-model'
const props = defineProps<{ panel: BotPanel; kind?: 'qq' | 'discord'; connectionName?: string; online?: boolean; interactionEnabled?: boolean }>()
const emit = defineEmits<{ select: [panel: BotPanel] }>()
const search = ref('')
const expanded = ref<Record<string, boolean>>({ '连接与运行': true, '功能设置': true })
const groups = computed(() => ['连接与运行', '功能设置'].map(label => ({ label,
  items: botPanels.filter(item => (item.id !== 'quant' || props.kind !== 'discord') && item.group === label && `${item.label} ${item.keywords}`.toLowerCase().includes(search.value.trim().toLowerCase())),
})).filter(group => group.items.length))
const icons = { connection: Setting, runtime: VideoPlay, records: Document, interaction: MagicStick, quant: DataAnalysis }
</script>
<template>
  <aside class="bot-console-navigation" aria-label="Bot功能导航">
    <div class="bot-nav-search"><Search aria-hidden="true" /><input v-model="search" aria-label="搜索功能与设置" placeholder="搜索功能与设置"></div>
    <nav>
      <section v-for="group in groups" :key="group.label" class="bot-nav-group">
        <button class="bot-nav-group-title" type="button" :aria-expanded="expanded[group.label] || Boolean(search)" @click="expanded[group.label] = !expanded[group.label]">
          <span>{{ group.label }}</span><span aria-hidden="true">{{ expanded[group.label] || search ? '⌃' : '⌄' }}</span>
        </button>
        <div v-if="expanded[group.label] || search" class="bot-nav-items">
          <button v-for="item in group.items" :key="item.id" type="button" :data-panel="item.id" :class="{ active: props.panel === item.id }"
            :aria-current="props.panel === item.id ? 'page' : undefined" @click="emit('select', item.id)">
            <span class="bot-nav-symbol" aria-hidden="true"><svg v-if="item.id === 'interaction'" viewBox="0 0 24 24" fill="currentColor"><ellipse cx="6" cy="8" rx="2.2" ry="3" transform="rotate(-25 6 8)"/><ellipse cx="11" cy="5.5" rx="2.1" ry="3"/><ellipse cx="16.5" cy="6.5" rx="2.1" ry="3" transform="rotate(20 16.5 6.5)"/><ellipse cx="20" cy="11" rx="2" ry="2.6" transform="rotate(30 20 11)"/><path d="M5 18c0-3 4-7 7-7s7 4 7 7c0 2-2 3-4 2-2-1-3-1-5 0-2 1-5 0-5-2Z"/></svg><component :is="icons[item.id]" v-else /></span><span>{{ item.label }}</span>
            <i v-if="item.id === 'interaction' && interactionEnabled" class="bot-status-dot online" aria-label="互动表情已启用" />
          </button>
        </div>
      </section>
      <p v-if="!groups.length" class="bot-console-muted">未找到匹配的功能。</p>
    </nav>
    <footer><span>当前连接：</span><strong>{{ connectionName || '未选择连接' }}</strong><i class="bot-status-dot" :class="{ online }" /></footer>
  </aside>
</template>
