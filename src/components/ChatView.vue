<script setup>
import MessageBubble from './MessageBubble.vue';
import { t, I18N } from '../i18n.js';

const MODULE_NAMES = I18N.app.moduleNames;

const props = defineProps({
  activeConv: { type: Object, required: true },
  input: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  lastAssistantIdx: { type: Number, default: -1 },
  messagesEndRef: { type: Object, default: null }
});

const emit = defineEmits(['update:input', 'send', 'keydown']);

function moduleName(m) {
  return MODULE_NAMES[m] || t('app.chat.cacheBadgeDefault');
}
</script>

<template>
  <div class="chat-view">
    <div class="messages-container">
      <div class="messages">
        <MessageBubble
          v-for="(msg, idx) in activeConv.messages"
          :key="idx"
          :msg="msg"
          :is-last-assistant="idx === lastAssistantIdx && msg.role === 'assistant'"
          :loading="loading"
          :module-name-fn="moduleName"
          @send="$emit('send', $event)"
        />

        <div v-if="loading" class="message assistant">
          <div class="message-avatar"><md-icon>smart_toy</md-icon></div>
          <div class="message-bubble loading-bubble">
            <div class="typing-indicator">
              <span /><span /><span />
            </div>
            <span class="loading-text">{{ t('app.chat.loading') }}</span>
          </div>
        </div>

        <div :ref="messagesEndRef"></div>
      </div>
    </div>

    <div class="chat-input-area">
      <div class="input-container">
        <div class="input-wrapper">
          <textarea
            class="message-input"
            :value="input"
            @input="$emit('update:input', $event.target.value)"
            @keydown="$emit('keydown', $event)"
            :placeholder="t('app.chat.inputPlaceholder')"
            rows="1"
          ></textarea>
          <button
            class="send-btn"
            @click="$emit('send', input)"
            :disabled="!input.trim() || loading"
          >
            <md-icon>send</md-icon>
          </button>
        </div>
        <div class="input-hint">{{ t('app.chat.inputHint') }}</div>
      </div>
    </div>
  </div>
</template>
