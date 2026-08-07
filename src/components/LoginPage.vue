<script setup>
import { ref } from 'vue';

const props = defineProps({
  loginMode: { type: String, default: 'local' },
  dingtalkConfig: { type: Object, default: () => ({}) },
  isLoading: { type: Boolean, default: false },
  onLogin: { type: Function, required: true }
});

const localLoading = ref(false);

const handleLogin = async () => {
  localLoading.value = true;
  try {
    await props.onLogin();
  } catch (e) {
    console.error('登录失败:', e);
    alert('登录失败: ' + e.message);
  } finally {
    localLoading.value = false;
  }
};

const isLoading = () => localLoading.value || props.isLoading;
const isDingTalk = () => props.loginMode === 'dingtalk';
const dingTalkReady = () => isDingTalk() && props.dingtalkConfig?.configured;

const tipText = () =>
  isDingTalk()
    ? (dingTalkReady()
        ? '将跳转至钉钉完成授权登录'
        : '钉钉登录未配置，请在 .env 设置 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET / DINGTALK_REDIRECT_URI')
    : '将自动使用本机已登录的宜搭身份';
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-card">
        <div class="login-icon"><md-icon>smart_toy</md-icon></div>
        <h1 class="login-title">AI 秘书</h1>
        <p class="login-subtitle">您的智能业务数据分析助手</p>
        <p class="login-desc">
          请登录以接入公司全部业务数据<br />
          销售 · 财务 · 人力资源 · 项目交付
        </p>

        <button
          class="dingtalk-login-btn"
          @click="handleLogin"
          :disabled="isLoading() || (isDingTalk() && !dingTalkReady())"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span>{{ isLoading() ? '正在登录...' : (isDingTalk() ? '钉钉登录' : '本机免登登录') }}</span>
        </button>

        <div class="login-tip">{{ tipText() }}</div>
      </div>

      <div class="login-features">
        <div class="feature-item">
          <span class="feature-icon"><md-icon>bar_chart</md-icon></span>
          <span>实时数据查询</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><md-icon>rocket_launch</md-icon></span>
          <span>智能业务分析</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon"><md-icon>groups</md-icon></span>
          <span>团队协作支持</span>
        </div>
      </div>
    </div>
  </div>
</template>
