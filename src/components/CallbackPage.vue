<script setup>
import { ref, onMounted } from 'vue';
import { t } from '../i18n.js';

const props = defineProps({
  finishDingTalkLogin: { type: Function, required: true }
});

const status = ref('processing');
const error = ref(null);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) {
    error.value = t('errors.callbackInvalidLink');
    status.value = 'error';
    return;
  }

  try {
    await props.finishDingTalkLogin(code, state);
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    error.value = e.message || t('errors.dingtalkLoginFailed');
    status.value = 'error';
  }
});
</script>

<template>
  <div class="callback-page">
    <div class="callback-card">
      <template v-if="status === 'processing'">
        <div class="callback-icon loading"><md-icon>smart_toy</md-icon></div>
        <h2>{{ t('callback.loggingIn') }}</h2>
        <p>{{ t('callback.verifying') }}</p>
        <div class="loading-spinner" />
      </template>

      <template v-else-if="status === 'error'">
        <div class="callback-icon error"><md-icon>warning</md-icon></div>
        <h2>{{ t('errors.loginFailed') }}</h2>
        <p>{{ error }}</p>
        <button @click="window.location.href = '/'">{{ t('callback.backToHome') }}</button>
      </template>
    </div>
  </div>
</template>
