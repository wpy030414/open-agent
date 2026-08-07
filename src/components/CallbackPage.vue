<script setup>
import { ref, onMounted } from 'vue';

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
    error.value = '回调链接无效，缺少授权码 code';
    status.value = 'error';
    return;
  }

  try {
    await props.finishDingTalkLogin(code, state);
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    error.value = e.message || '钉钉登录失败';
    status.value = 'error';
  }
});
</script>

<template>
  <div class="callback-page">
    <div class="callback-card">
      <template v-if="status === 'processing'">
        <div class="callback-icon loading"><md-icon>smart_toy</md-icon></div>
        <h2>正在登录...</h2>
        <p>请稍候，正在完成钉钉身份验证</p>
        <div class="loading-spinner" />
      </template>

      <template v-else-if="status === 'error'">
        <div class="callback-icon error"><md-icon>warning</md-icon></div>
        <h2>登录失败</h2>
        <p>{{ error }}</p>
        <button @click="window.location.href = '/'">返回首页</button>
      </template>
    </div>
  </div>
</template>
