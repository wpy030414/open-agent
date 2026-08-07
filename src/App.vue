<script setup>
import { computed } from 'vue';
import { useAuth } from './composables/useAuth.js';
import { useTheme } from './composables/useTheme.js';
import LoginPage from './components/LoginPage.vue';
import CallbackPage from './components/CallbackPage.vue';
import MainApp from './components/MainApp.vue';

// 应用 Material You 动态配色（在 main.js 已调用一次，这里取返回值供子组件用）
useTheme();

const auth = useAuth();

// 钉钉登录回调：URL 带 code= 即认为是 OAuth 回调
const isCallbackPage = computed(() =>
  window.location.pathname === '/callback' ||
  window.location.search.includes('code=')
);
</script>

<template>
  <CallbackPage
    v-if="isCallbackPage"
    :finish-ding-talk-login="auth.finishDingTalkLogin"
  />
  <LoginPage
    v-else-if="!auth.isLoggedIn.value"
    :login-mode="auth.loginMode.value"
    :dingtalk-config="auth.dingtalkConfig.value"
    :is-loading="auth.isLoading.value"
    :on-login="auth.startLogin"
  />
  <MainApp
    v-else
    :user="auth.user.value"
    :on-logout="auth.logout"
  />
</template>
