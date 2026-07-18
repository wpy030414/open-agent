import { useState, useEffect, useCallback } from 'react';

// 端点
const IDENTITY_ENDPOINT = '/api/whoami';            // 本机免密：读本地宜搭 cookies
const AUTH_CONFIG_ENDPOINT = '/api/auth/config';    // 登录方式配置
const DINGTALK_CALLBACK_ENDPOINT = '/api/auth/dingtalk/callback'; // 钉钉授权码换身份

// 存储键名
const STORAGE_KEY = 'ai-secretary-user';
const DINGTALK_STATE_KEY = 'ai-secretary-dingtalk-state';

/**
 * 构造钉钉标准 OAuth 授权 URL（整页跳转）
 * clientId / redirectUri 由后端 /api/auth/config 下发（公开参数）
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

// 认证 Hook
export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  // 默认 local（本机开发场景最常见），config 拉取后覆盖为实际值
  const [loginMode, setLoginMode] = useState('local');
  const [dingtalkConfig, setDingtalkConfig] = useState({ clientId: '', redirectUri: '', configured: false });

  // 持久化用户
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // 拉取登录配置
  useEffect(() => {
    fetch(AUTH_CONFIG_ENDPOINT)
      .then(res => res.json())
      .then(data => {
        setLoginMode(data.loginMode || 'dingtalk');
        setDingtalkConfig(data.dingtalk || { clientId: '', redirectUri: '', configured: false });
      })
      .catch(() => { /* 拉取失败保持默认 local，不阻塞本机免密 */ });
  }, []);

  // 后端 identity → 前端 user
  const mapIdentity = useCallback((identity) => ({
    userId: identity.userId,
    userName: identity.userName || '用户',
    orgName: identity.orgName || '',
    orgId: identity.orgId,
    role: identity.role || '管理员',
    dept: identity.dept || '管理层',
    avatar: identity.avatar || null,
    dataSource: identity.dataSource || 'yida',
    loginTime: identity.loginTime || new Date().toISOString()
  }), []);

  // 本机免密登录（读本地宜搭 cookies）
  const loginLocal = useCallback(async () => {
    const res = await fetch(IDENTITY_ENDPOINT);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '身份获取失败');
    }
    const identity = await res.json();
    const u = mapIdentity(identity);
    setUser(u);
    return u;
  }, [mapIdentity]);

  // 统一登录入口：按 loginMode 分发
  const startLogin = useCallback(async () => {
    if (loginMode === 'dingtalk') {
      const { clientId, redirectUri } = dingtalkConfig;
      if (!clientId || !redirectUri) {
        throw new Error('钉钉登录未配置');
      }
      const state = makeAndStashState();
      window.location.href = getDingTalkLoginUrl(clientId, redirectUri, state);
      return null;
    }
    setIsLoading(true);
    try {
      return await loginLocal();
    } finally {
      setIsLoading(false);
    }
  }, [loginMode, dingtalkConfig, loginLocal]);

  // 钉钉回调：校验 state → 用 code 换身份
  const finishDingTalkLogin = useCallback(async (code, state) => {
    // CSRF 校验
    const savedState = sessionStorage.getItem(DINGTALK_STATE_KEY);
    sessionStorage.removeItem(DINGTALK_STATE_KEY);
    if (state && savedState && state !== savedState) {
      throw new Error('登录状态校验失败（state 不匹配），请重新登录');
    }
    const res = await fetch(DINGTALK_CALLBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '钉钉登录失败');
    }
    const identity = await res.json();
    const u = mapIdentity(identity);
    // 同步落盘：避免跳转/刷新前 React effect 尚未持久化
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return u;
  }, [mapIdentity]);

  // 退出登录
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    user,
    isLoggedIn: !!user,
    isLoading,
    loginMode,
    dingtalkConfig,
    startLogin,
    finishDingTalkLogin,
    logout,
    // 兼容旧调用名
    login: startLogin
  };
}

export default useAuth;
