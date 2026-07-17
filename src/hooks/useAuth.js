import { useState, useEffect, useCallback } from 'react';

// 身份来源（方案 B：本机已登录的宜搭身份，无需钉钉 OAuth）
const IDENTITY_ENDPOINT = '/api/whoami';

// 生成钉钉登录 URL（保留备用）
export function getDingTalkLoginUrl() {
  return IDENTITY_ENDPOINT;
}

// 解析回调 URL 中的用户信息（兼容旧链路，现不再使用）
export function parseCallbackParams() {
  return null;
}

// 存储键名
const STORAGE_KEY = 'ai-secretary-user';

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

  // 保存用户到 localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // 登录：通过本机宜搭 cookies 拿到身份
  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(IDENTITY_ENDPOINT);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '身份获取失败');
      }
      const identity = await res.json();
      const loggedInUser = {
        userId: identity.userId,
        userName: identity.userName || '用户',
        orgName: identity.orgName || '合肥一六八玫瑰园学校东校',
        orgId: identity.orgId,
        role: identity.role || '管理员',
        dept: identity.dept || '管理层',
        avatar: null,
        dataSource: identity.dataSource || 'yida',
        loginTime: new Date().toISOString()
      };
      setUser(loggedInUser);
      return loggedInUser;
    } catch (e) {
      console.error('登录失败:', e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 退出登录
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // 处理登录回调（方案 B 已废弃回调页，保留为 noop）
  const handleCallback = useCallback(async () => {
    await login();
  }, [login]);

  return {
    user,
    isLoggedIn: !!user,
    isLoading,
    login,
    logout,
    handleCallback
  };
}

export default useAuth;
