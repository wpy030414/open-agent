import React, { useState } from 'react';
import Icons from '../icons.jsx';

export default function LoginPage({ onLogin, isLoading: parentLoading }) {
  const [localLoading, setLocalLoading] = useState(false);

  const handleLogin = async () => {
    setLocalLoading(true);
    try {
      const res = await fetch('/api/whoami');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '身份获取失败');
      }
      const identity = await res.json();
      const user = {
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
      localStorage.setItem('ai-secretary-user', JSON.stringify(user));
      // 通知父组件已登录，触发界面切换到聊天页
      onLogin();
    } catch (e) {
      console.error('登录失败:', e);
      alert('登录失败: ' + e.message);
    } finally {
      setLocalLoading(false);
    }
  };

  const isLoading = localLoading || parentLoading;

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-icon">{Icons.robot}</div>
          <h1 className="login-title">AI 秘书</h1>
          <p className="login-subtitle">
            您的智能业务数据分析助手
          </p>
          <p className="login-desc">
            请登录以接入公司全部业务数据<br />
            销售 · 财务 · 人力资源 · 项目交付
          </p>

          <button
            className="dingtalk-login-btn"
            onClick={handleLogin}
            disabled={isLoading}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <span>{isLoading ? '正在登录...' : '本机免登登录'}</span>
          </button>

          <div className="login-tip">
            将自动使用本机已登录的宜搭身份
          </div>
        </div>

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">{Icons.chart}</span>
            <span>实时数据查询</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">{Icons.rocket}</span>
            <span>智能业务分析</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">{Icons.people}</span>
            <span>团队协作支持</span>
          </div>
        </div>
      </div>
    </div>
  );
}
