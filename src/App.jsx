import React, { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import Icons from './icons.jsx';
import MermaidChart from './components/MermaidChart.jsx';
import LoginPage from './components/LoginPage.jsx';
import CallbackPage from './components/CallbackPage.jsx';
import { useAuth, parseCallbackParams, getDingTalkLoginUrl } from './hooks/useAuth.js';
import { t, I18N } from './i18n.js';

// ==================== 主应用 ====================
const MODULE_NAMES = I18N.app.moduleNames;

export default function App() {
  const { user, isLoggedIn, isLoading, login, logout, handleCallback } = useAuth();
  const [callbackHandled, setCallbackHandled] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ai-secretary-theme') || 'light');

  // 应用主题
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ai-secretary-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // 检查是否是回调页面
  const isCallbackPage = window.location.pathname === '/callback' ||
    window.location.search.includes('code=') ||
    window.location.search.includes('userId=');

  // 检查登录回调
  useEffect(() => {
    if (callbackHandled) return;

    const callbackParams = parseCallbackParams();
    if (callbackParams) {
      setCallbackHandled(true);
      handleCallback(callbackParams);
    }
  }, [handleCallback, callbackHandled]);

  // 如果是回调页面，显示回调处理
  if (isCallbackPage || (!isLoggedIn && window.location.search.includes('code='))) {
    return (
      <CallbackPage
        onLoginSuccess={(userData) => {
          window.location.href = '/';
        }}
      />
    );
  }

  // 如果未登录，显示登录页
  if (!isLoggedIn) {
    return <LoginPage onLogin={login} isLoading={isLoading} />;
  }

  return <MainApp user={user} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />;
}

// ==================== 主应用界面（登录后）====================
function MainApp({ user, onLogout, theme, toggleTheme }) {
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem('ai-secretary-conversations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeConvId, setActiveConvId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cachedModules, setCachedModules] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // 获取缓存模块列表，用于生成真实快捷问题
  useEffect(() => {
    fetch('/api/cache')
      .then(res => res.json())
      .then(data => {
        const modules = Object.values(data.modules || {});
        // 按数据量排序，取前 4 个
        const sorted = modules
          .filter(m => m.totalCount > 0)
          .sort((a, b) => (b.totalCount || 0) - (a.totalCount || 0))
          .slice(0, 4);
        setCachedModules(sorted);
      })
      .catch(e => console.error('获取缓存模块失败:', e));
  }, []);

  useEffect(() => {
    localStorage.setItem('ai-secretary-conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId]);

  const activeConv = conversations.find(c => c.id === activeConvId);

  const createConversation = () => {
    setActiveConvId(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const deleteConversation = (id, e) => {
    e.stopPropagation();
    const next = conversations.filter(c => c.id !== id);
    setConversations(next);
    if (activeConvId === id) {
      setActiveConvId(next.length > 0 ? next[0].id : null);
    }
  };

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || loading) return;

    const userMessage = { role: 'user', content: text.trim() };
    let convId = activeConvId;
    let convMessages = [];

    if (!convId) {
      convId = `conv-${Date.now()}`;
      const newConv = {
        id: convId,
        title: text.trim().slice(0, 24) + (text.length > 24 ? '...' : ''),
        messages: [userMessage],
        createdAt: new Date().toISOString()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConvId(convId);
      convMessages = [userMessage];
    } else {
      setConversations(prev => prev.map(c => {
        if (c.id === convId) {
          convMessages = [...c.messages, userMessage];
          return { ...c, messages: convMessages };
        }
        return c;
      }));
    }

    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: convMessages.slice(0, -1),
          user: {
            name: user.userName,
            role: user.role,
            dept: user.dept,
            userId: user.userId
          }
        })
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage = {
        role: 'assistant',
        content: data.reply,
        module: data.module,
        cacheHit: data.cacheHit
      };

      setConversations(prev => prev.map(c => {
        if (c.id === convId) {
          return { ...c, messages: [...c.messages, assistantMessage] };
        }
        return c;
      }));
    } catch (e) {
      message.error(`发送失败: ${e.message}`);
      setConversations(prev => prev.map(c => {
        if (c.id === convId) {
          return { ...c, messages: c.messages.slice(0, -1) };
        }
        return c;
      }));
    } finally {
      setLoading(false);
    }
  }, [activeConvId, loading, user]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="app-layout">
      {/* 侧边栏 */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-content">
          <button className="new-chat-btn" onClick={createConversation}>
            {Icons.plus}
            <span>新建对话</span>
          </button>

          <nav className="conversation-list">
            {conversations.length === 0 ? (
              <div className="empty-state">暂无历史对话</div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`conversation-item ${activeConvId === conv.id ? 'active' : ''}`}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  {Icons.message}
                  <div className="conversation-info">
                    <div className="conversation-title">{conv.title}</div>
                    <div className="conversation-time">{formatTime(conv.createdAt)}</div>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => deleteConversation(conv.id, e)}
                    title="删除"
                  >
                    {Icons.delete}
                  </button>
                </div>
              ))
            )}
          </nav>

          <div className="sidebar-footer">
            <button className="theme-toggle-btn" onClick={toggleTheme} title={t('app.sidebar.footer.themeToggle')}>
              {theme === 'dark' ? Icons.sun : Icons.moon}
              <span>{theme === 'dark' ? '白日' : '黑夜'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <main className="main-area">
        <header className="top-bar">
          <button
            className={`menu-btn ${collapsed ? 'collapsed' : ''}`}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {Icons.menu}
          </button>
          <div className="brand">
            {Icons.robot}
            <span>{t('product.name')}</span>
          </div>
          <div className="top-bar-right">
            <div className="user-menu">
              <div className="user-info">
                {Icons.user}
                <div className="user-details">
                  <span className="user-name">{user.userName}</span>
                  <span className="user-org">{user.orgName || '合肥一六八玫瑰园学校东校'}</span>
                </div>
                <span className="user-role">{user.role}</span>
              </div>
              <button className="logout-btn" onClick={onLogout} title="退出登录">
                {Icons.logout}
              </button>
            </div>
          </div>
        </header>

        <div className="content-area">
          {!activeConv ? (
            // 首页
            <div className="home-view">
              <div className="home-hero">
                <div className="hero-icon">{Icons.robot}</div>
                <h1 className="hero-title">{t('app.home.greeting', { userName: user.userName })}</h1>
                <p className="hero-subtitle">
                  {t('app.home.subtitle')}<br />
                  {t('app.home.subtitle2')}
                </p>
              </div>

              <div className="input-container">
                <div className="input-wrapper">
                  <textarea
                    ref={inputRef}
                    className="message-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('app.home.inputPlaceholder')}
                    rows={1}
                  />
                  <button
                    className="send-btn"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                  >
                    {Icons.send}
                  </button>
                </div>
                <div className="input-hint">{t('app.home.inputHint')}</div>
              </div>

              <div className="quick-actions">
                {cachedModules.map((m, idx) => {
                  const icons = [Icons.chart, Icons.rocket, Icons.people, Icons.wallet];
                  const icon = icons[idx % icons.length];
                  // 生成基于真实数据的问题
                  let question;
                  if (m.formName.includes('打卡') || m.formName.includes('考勤')) {
                    question = `${m.formName}最新数据如何？共${m.totalCount}条记录`;
                  } else if (m.formName.includes('申请') || m.formName.includes('审批')) {
                    question = `${m.formName}有多少待处理？共${m.totalCount}条`;
                  } else if (m.formName.includes('课程') || m.formName.includes('社团')) {
                    question = `${m.formName}开展情况如何？共${m.totalCount}条记录`;
                  } else {
                    question = `${m.formName}数据概况？共${m.totalCount}条`;
                  }
                  return (
                    <button
                      key={m.formUuid || idx}
                      className="quick-action-btn"
                      onClick={() => sendMessage(question)}
                    >
                      {icon}
                      <span>{question}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            // 对话页
            <div className="chat-view">
              <div className="messages-container">
                <div className="messages">
                  {activeConv.messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <div className="message-avatar">{Icons.robot}</div>
                      )}
                      <div className="message-bubble">
                        <MessageContent content={msg.content} />
                        {msg.cacheHit && (
                          <div className="cache-badge">
                            <span className="cache-dot" />
                            {t('app.chat.cacheBadge', { module: MODULE_NAMES[msg.module] || t('app.chat.cacheBadgeDefault') })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="message assistant">
                      <div className="message-avatar">{Icons.robot}</div>
                      <div className="message-bubble loading-bubble">
                        <div className="typing-indicator">
                          <span /><span /><span />
                        </div>
                        <span className="loading-text">{t('app.chat.loading')}</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="chat-input-area">
                <div className="input-container">
                  <div className="input-wrapper">
                    <textarea
                      className="message-input"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('app.chat.inputPlaceholder')}
                      rows={1}
                    />
                    <button
                      className="send-btn"
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || loading}
                    >
                      {Icons.send}
                    </button>
                  </div>
                  <div className="input-hint">{t('app.chat.inputHint')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ==================== 消息内容渲染（支持 mermaid）====================
function MessageContent({ content }) {
  const parts = content.split(/```mermaid([\s\S]*?)```/);

  return (
    <div className="message-content">
      {parts.map((part, idx) => {
        if (idx % 2 === 1) {
          return <MermaidChart key={idx} chart={part.trim()} />;
        }
        return <TextBlock key={idx} content={part} />;
      })}
    </div>
  );
}

function TextBlock({ content }) {
  const lines = content.split('\n');
  const elements = [];
  let tableRows = [];
  let inTable = false;

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div className="table-wrapper" key={`table-${elements.length}`}>
          <table>
            <thead>
              <tr>
                {tableRows[0].map((cell, i) => (
                  <th key={i}>{renderInline(cell.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(2).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{renderInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  lines.forEach((line, idx) => {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.split('|').filter(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c.trim()))) {
        return;
      }
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      return;
    }

    if (inTable) {
      flushTable();
    }

    if (line.startsWith('## ')) {
      elements.push(<h2 className="content-h2" key={idx}>{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 className="content-h3" key={idx}>{renderInline(line.slice(4))}</h3>);
    } else if (line.trim().startsWith('- ')) {
      const text = line.trim().slice(2);
      elements.push(
        <div className="list-item" key={idx}>
          <span className="list-bullet" />
          <span>{renderInline(text)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line.trim())) {
      const match = line.trim().match(/^(\d+)\.\s(.*)$/);
      elements.push(
        <div className="list-item ordered" key={idx}>
          <span className="list-number">{match[1]}.</span>
          <span>{renderInline(match[2])}</span>
        </div>
      );
    } else if (line.trim()) {
      elements.push(<p className="content-p" key={idx}>{renderInline(line)}</p>);
    }
  });

  if (inTable) flushTable();

  return <>{elements}</>;
}

function renderInline(text) {
  // 先处理行内代码，再处理粗体
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*(?!\*))/g);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
