import React, { useEffect, useState } from 'react';
import Icons from '../icons.jsx';

export default function CallbackPage({ onLoginSuccess }) {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // 从 URL 获取参数
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const userId = params.get('userId');
        const userName = params.get('userName');

        if (!code && !userId) {
          setError('未获取到授权信息');
          setStatus('error');
          return;
        }

        // 保存用户信息
        const user = {
          userId: userId || `DD-${Date.now()}`,
          userName: userName || '用户',
          dept: '总裁办',
          role: 'CEO',
          orgName: '合肥一六八玫瑰园学校东校',
          orgId: 'ding1da2ff1412984bb0a1320dcb25e91351',
          code: code,
          loginTime: new Date().toISOString()
        };

        localStorage.setItem('ai-secretary-user', JSON.stringify(user));

        // 清理 URL
        window.history.replaceState({}, '', window.location.pathname);

        // 通知父组件
        onLoginSuccess(user);
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
    };

    handleCallback();
  }, [onLoginSuccess]);

  return (
    <div className="callback-page">
      <div className="callback-card">
        {status === 'processing' && (
          <>
            <div className="callback-icon loading">{Icons.robot}</div>
            <h2>正在登录...</h2>
            <p>请稍候，正在完成身份验证</p>
            <div className="loading-spinner" />
          </>
        )}

        {status === 'error' && (
          <>
            <div className="callback-icon error">⚠</div>
            <h2>登录失败</h2>
            <p>{error}</p>
            <button onClick={() => window.location.href = '/'}>
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}
