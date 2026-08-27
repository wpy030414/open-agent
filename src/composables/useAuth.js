/**
 * useAuth — 双模式认证 composable（Vue 版）
 * 纯 fetch 逻辑，从 React useAuth.js 移植。
 *
 * - local：读 /api/whoami（本机宜搭 cookies）
 * - dingtalk：跳转钉钉 OAuth，回调页用 code 换身份
 */
import { ref, watch, computed } from 'vue';
import { t } from '../i18n.js';

// 端点
const IDENTITY_ENDPOINT = '/api/whoami';
const AUTH_CONFIG_ENDPOINT = '/api/auth/config';
const DINGTALK_CALLBACK_ENDPOINT = '/api/auth/dingtalk/callback';

// 存储键名
const STORAGE_KEY = 'ai-secretary-user';
const DINGTALK_STATE_KEY = 'ai-secretary-dingtalk-state';

/**
 * 构造钉钉标准 OAuth 授权 URL（整页跳转）
 */
export function getDingTalkLoginUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid',
    prompt: 'consent',
    state
  });
  return `https://login.dingtalk.com/oauth2/auth?${params.toString()}`;
}

/**
 * 从回调 URL 解析授权码与 state；无 code 返回 null
 */
export function parseCallbackParams() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;
  return { code, state: params.get('state') };
}

// 生成随机 state 并暂存 sessionStorage，回调时校验以防范 CSRF
function makeAndStashState() {
  const arr = new Uint8Array(16);
  (window.crypto || {}).getRandomValues?.(arr);
  const state = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('') || String(Math.random());
  sessionStorage.setItem(DINGTALK_STATE_KEY, state);
  return state;
}

export function useAuth() {
  const user = ref((() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })());
  const isLoading = ref(false);
  const loginMode = ref('local');
  const dingtalkConfig = ref({ clientId: '', redirectUri: '', configured: false });
  const env = ref('');

  // 持久化用户
  watch(user, (u) => {
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_KEY);
  }, { deep: true });

  // 后端 identity → 前端 user
  const mapIdentity = (identity) => ({
    userId: identity.userId,
    userName: identity.userName || t('user.defaultName'),
    orgName: identity.orgName || '',
    orgId: identity.orgId,
    role: identity.role || t('user.roleAdmin'),
    dept: identity.dept || t('user.deptManagement'),
    avatar: identity.avatar || null,
    dataSource: identity.dataSource || 'yida',
    loginTime: identity.loginTime || new Date().toISOString()
  });

  // 拉取登录配置
  fetch(AUTH_CONFIG_ENDPOINT)
    .then(res => res.json())
    .then(async (data) => {
      env.value = data.env || '';
      loginMode.value = data.loginMode || 'dingtalk';
      dingtalkConfig.value = data.dingtalk || { clientId: '', redirectUri: '', configured: false };

      // dev 环境：完全免登，自动塞 dev 用户，跳过登录页
      if (env.value === 'dev' && !user.value) {
        try {
          const identity = await (await fetch(IDENTITY_ENDPOINT)).json();
          user.value = mapIdentity(identity);
        } catch (e) {
          // /api/whoami 失败时用前端兜底 dev 用户
          user.value = {
            userId: 'dev',
            userName: t('user.devName'),
            orgName: t('user.devOrg'),
            role: t('user.roleAdmin'),
            dept: t('user.deptManagement'),
            dataSource: 'dev'
          };
        }
      }
    })
    .catch(() => { /* 拉取失败保持默认 local，不阻塞本机免密 */ });

  // 本机免密登录
  const loginLocal = async () => {
    const res = await fetch(IDENTITY_ENDPOINT);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t('errors.identityFetchFailed'));
    }
    const identity = await res.json();
    const u = mapIdentity(identity);
    user.value = u;
    return u;
  };

  // 统一登录入口：按 loginMode 分发
  const startLogin = async () => {
    if (loginMode.value === 'dingtalk') {
      const { clientId, redirectUri } = dingtalkConfig.value;
      if (!clientId || !redirectUri) {
        throw new Error(t('errors.dingtalkNotConfigured'));
      }
      const state = makeAndStashState();
      window.location.href = getDingTalkLoginUrl(clientId, redirectUri, state);
      return null;
    }
    isLoading.value = true;
    try {
      return await loginLocal();
    } finally {
      isLoading.value = false;
    }
  };

  // 钉钉回调：校验 state → 用 code 换身份
  const finishDingTalkLogin = async (code, state) => {
    const savedState = sessionStorage.getItem(DINGTALK_STATE_KEY);
    sessionStorage.removeItem(DINGTALK_STATE_KEY);
    if (state && savedState && state !== savedState) {
      throw new Error(t('errors.stateMismatch'));
    }
    const res = await fetch(DINGTALK_CALLBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t('errors.dingtalkLoginFailed'));
    }
    const identity = await res.json();
    const u = mapIdentity(identity);
    // 同步落盘：避免跳转/刷新前 watch 尚未持久化
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    user.value = u;
    return u;
  };

  const logout = () => {
    user.value = null;
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    user,
    isLoggedIn: computed(() => !!user.value),
    isLoading,
    loginMode,
    dingtalkConfig,
    startLogin,
    finishDingTalkLogin,
    logout,
    login: startLogin
  };
}
