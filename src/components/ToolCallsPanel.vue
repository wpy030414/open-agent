<script setup>
import { ref } from 'vue';

defineProps({
  calls: { type: Array, default: () => [] }
});

const open = ref(false);
</script>

<template>
  <div class="tool-calls-panel">
    <button class="tool-calls-toggle" @click="open = !open">
      <span class="tool-calls-toggle-icon">{{ open ? '▼' : '▶' }}</span>
      <span>🔧 工具调用（{{ calls.length }} 次）</span>
    </button>
    <div v-if="open" class="tool-calls-list">
      <div v-for="(tc, i) in calls" :key="i" class="tool-call-item">
        <div class="tool-call-name">📂 {{ tc.name }}</div>
        <div class="tool-call-input">
          {{ typeof tc.input === 'object' ? JSON.stringify(tc.input) : tc.input }}
        </div>
        <div v-if="tc.result != null" class="tool-call-result">{{ tc.result }}</div>
      </div>
    </div>
  </div>
</template>
