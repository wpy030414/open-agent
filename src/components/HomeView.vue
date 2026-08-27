<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';

const props = defineProps({
  user: { type: Object, required: true },
  input: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  cachedModules: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:input', 'send', 'keydown']);

const QUICK_ICONS = ['bar_chart', 'rocket_launch', 'groups', 'account_balance_wallet'];

// 基于真实数据生成问题（移植自 App.jsx）
function makeQuestion(m) {
  if (m.formName.includes('打卡') || m.formName.includes('考勤')) {
    return t('app.home.questionAttendance', { formName: m.formName, totalCount: m.totalCount });
  } else if (m.formName.includes('申请') || m.formName.includes('审批')) {
    return t('app.home.questionApproval', { formName: m.formName, totalCount: m.totalCount });
  } else if (m.formName.includes('课程') || m.formName.includes('社团')) {
    return t('app.home.questionCourse', { formName: m.formName, totalCount: m.totalCount });
  }
  return t('app.home.questionDefault', { formName: m.formName, totalCount: m.totalCount });
}

const greeting = computed(() => t('app.home.greeting', { userName: props.user.userName }));
</script>

<template>
  <div class="home-view">
    <div class="home-hero">
      <div class="hero-icon"><md-icon>smart_toy</md-icon></div>
      <h1 class="hero-title">{{ greeting }}</h1>
      <p class="hero-subtitle">
        {{ t('app.home.subtitle') }}<br />
        {{ t('app.home.subtitle2') }}
      </p>
    </div>

    <div class="input-container">
      <div class="input-wrapper">
        <textarea
          class="message-input"
          :value="input"
          @input="$emit('update:input', $event.target.value)"
          @keydown="$emit('keydown', $event)"
          :placeholder="t('app.home.inputPlaceholder')"
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
      <div class="input-hint">{{ t('app.home.inputHint') }}</div>
    </div>

    <div class="quick-actions">
      <button
        v-for="(m, idx) in cachedModules"
        :key="m.formUuid || idx"
        class="quick-action-btn"
        @click="$emit('send', makeQuestion(m))"
      >
        <md-icon>{{ QUICK_ICONS[idx % QUICK_ICONS.length] }}</md-icon>
        <span>{{ makeQuestion(m) }}</span>
      </button>
    </div>
  </div>
</template>
