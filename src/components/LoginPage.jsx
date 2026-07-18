import React, { useState } from 'react';
import Icons from '../icons.jsx';

export default function LoginPage({ onLogin, isLoading: parentLoading, loginMode, dingtalkConfig }) {
  const [localLoading, setLocalLoading] = useState(false);

  const handleLogin = async () => {
    setLocalLoading(true);
    try {
      // 委托给父组件的 startLogin() 处理：local 走 whoami，dingtalk 跳转授权
      await onLogin();
    } catch (e) {
      console.error('登录失败:', e);
      alert('登录失败: ' + e.message);
    } finally {
      setLocalLoading(false);
    }
  };

  const isLoading = localLoading || parentLoading;
  const isDingTalk = loginMode === 'dingtalk';
  const dingTalkReady = isDingTalk && dingtalkConfig?.configured;

  const tipText = isDingTalk
    ? (dingTalkReady
        ? '将跳转至钉钉完成授权登录'
        : '钉钉登录未配置，请在 .env 设置 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET / DINGTALK_REDIRECT_URI')
    : '将自动使用本机已登录的宜搭身份';

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
            disabled={isLoading || (isDingTalk && !dingTalkReady)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            <span>{isLoading ? '正在登录...' : (isDingTalk ? '钉钉登录' : '本机免登登录')}</span>
          </button>

          <div className="login-tip">{tipText}</div>
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
