<script setup lang="ts">
import qqIcon from '../../assets/bot-qq.png'
import discordIcon from '../../assets/bot-discord.png'

defineProps<{ kind: 'qq' | 'discord' }>()
</script>

<template>
  <img class="bot-brand-icon" :src="kind === 'qq' ? qqIcon : discordIcon" alt="" aria-hidden="true" />
</template>

<style scoped>
.bot-brand-icon {
  display: block;
  flex: none;
  width: 22px;
  height: 22px;
  object-fit: contain;
}
</style>
