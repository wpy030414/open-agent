<script setup>
import { ref } from 'vue';
import { t } from '../i18n.js';

defineProps({
  text: { type: String, default: '' }
});

const open = ref(false);
</script>

<template>
  <div class="thinking-block">
    <button class="thinking-toggle" @click="open = !open">
      <span class="thinking-toggle-icon">{{ open ? '▼' : '▶' }}</span>
      <span>{{ t('thinking.title') }}</span>
    </button>
    <pre v-if="open" class="thinking-content">{{ text }}</pre>
  </div>
</template>
