import React, { useEffect, useState } from 'react';
import Icons from '../icons.jsx';

/**
 * 钉钉标准登录回调页
 * URL 形如 /callback?code=xxx&state=yyy
 * 用 code + state 调 finishDingTalkLogin 完成登录，setUser 会驱动 App 切到主界面
 */
export default function CallbackPage({ finishDingTalkLogin }) {
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code) {
      setError('回调链接无效，缺少授权码 code');
      setStatus('error');
      return;
    }

    finishDingTalkLogin(code, state)
      .then(() => {
        // 登录成功：清理 URL 中的 code/state（user 已落盘，App 依据 isLoggedIn 切换视图）
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch(e => {
        setError(e.message || '钉钉登录失败');
        setStatus('error');
      });
  }, [finishDingTalkLogin]);

  return (
    <div className="callback-page">
      <div className="callback-card">
        {status === 'processing' && (
          <>
            <div className="callback-icon loading">{Icons.robot}</div>
            <h2>正在登录...</h2>
            <p>请稍候，正在完成钉钉身份验证</p>
            <div className="loading-spinner" />
          </>
        )}

        {status === 'error' && (
          <>
            <div className="callback-icon error">⚠</div>
            <h2>登录失败</h2>
            <p>{error}</p>
            <button onClick={() => { window.location.href = '/'; }}>
              返回首页
            </button>
          </>
        )}
      </div>
    </div>
  );
}
