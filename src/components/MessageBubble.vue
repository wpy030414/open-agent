<script setup>
import MessageContent from './MessageContent.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallsPanel from './ToolCallsPanel.vue';
import { t } from '../i18n.js';

const props = defineProps({
  msg: { type: Object, required: true },
  isLastAssistant: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  moduleNameFn: { type: Function, default: () => '' }
});

const emit = defineEmits(['send']);
</script>

<template>
  <div :class="['message', msg.role]">
    <div v-if="msg.role === 'assistant'" class="message-avatar">
      <md-icon>smart_toy</md-icon>
    </div>
    <div class="message-body">
      <!-- 思考内容 -->
      <ThinkingBlock v-if="msg.thinking" :text="msg.thinking" />

      <!-- 工具调用链 -->
      <ToolCallsPanel v-if="msg.toolCalls?.length > 0" :calls="msg.toolCalls" />

      <div class="message-bubble">
        <MessageContent :content="msg.content" />
        <div v-if="msg.cacheHit" class="cache-badge">
          <span class="cache-dot" />
          {{ t('app.chat.cacheBadge', { module: moduleNameFn(msg.module) }) }}
        </div>
      </div>

      <!-- 追问建议：只挂最后一条 assistant -->
      <div
        v-if="isLastAssistant && !loading && msg.suggestions?.length > 0"
        class="suggestion-chips"
      >
        <button
          v-for="(q, qi) in msg.suggestions"
          :key="qi"
          class="suggestion-chip"
          :title="q"
          @click="$emit('send', q)"
        >
          {{ q }}
        </button>
      </div>
    </div>
  </div>
</template>
