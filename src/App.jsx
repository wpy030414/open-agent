import React, { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import Icons from './icons.jsx';
import MermaidChart from './components/MermaidChart.jsx';
import LoginPage from './components/LoginPage.jsx';
import CallbackPage from './components/CallbackPage.jsx';
import { useAuth, parseCallbackParams, getDingTalkLoginUrl } from './hooks/useAuth.js';

// ==================== 快捷问题配置 ====================
const QUICK_QUESTIONS = [
  { icon: Icons.chart, text: '本月销售业绩如何？', module: 'sales' },
  { icon: Icons.wallet, text: '公司利润和成本结构？', module: 'finance' },
  { icon: Icons.people, text: '团队人效和绩效分布？', module: 'hr' },
  { icon: Icons.rocket, text: '项目延期风险有哪些？', module: 'project' }
];

const MODULE_NAMES = {
  sales: '销售管理',
  finance: '财务模块',
  hr: '人力资源',
  project: '项目交付'
};

// ==================== 主应用 ====================
export default function App() {
  const { user, isLoggedIn, isLoading, login, logout, handleCallback } = useAuth();
  const [callbackHandled, setCallbackHandled] = useState(false);

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

  return <MainApp user={user} onLogout={logout} />;
}

// ==================== 主应用界面（登录后）====================
function MainApp({ user, onLogout }) {
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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
            <span className="model-badge">AI 秘书</span>
            <span className="cache-info">数据每 6 小时更新</span>
          </div>
        </div>

        <button className="collapse-btn" onClick={() => setCollapsed(true)} title="收起">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
      </aside>

      {/* 主区域 */}
      <main className="main-area">
        <header className="top-bar">
          {collapsed && (
            <button className="menu-btn" onClick={() => setCollapsed(false)} title="展开">
              {Icons.menu}
            </button>
          )}
          <div className="brand">
            {Icons.robot}
            <span>AI 秘书</span>
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
                <h1 className="hero-title">您好，{user.userName}</h1>
                <p className="hero-subtitle">
                  我是您的 AI 秘书，已接入公司全部业务数据<br />
                  可以即时回答您的业务问询，并自动调取相关数据分析
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
                    placeholder="发送消息..."
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
                <div className="input-hint">AI 秘书会基于公司真实数据回答，但可能偶尔出错，请核查关键数据</div>
              </div>

              <div className="quick-actions">
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q.text}
                    className="quick-action-btn"
                    onClick={() => sendMessage(q.text)}
                  >
                    {q.icon}
                    <span>{q.text}</span>
                  </button>
                ))}
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
                            已调取 {MODULE_NAMES[msg.module] || '业务'} 数据
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
                        <span className="loading-text">AI 正在分析数据...</span>
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
                      placeholder="发送消息..."
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
                  <div className="input-hint">AI 秘书会基于公司真实数据回答，但可能偶尔出错，请核查关键数据</div>
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
                  <th key={i}>{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(2).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell.trim()}</td>
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
      elements.push(<h2 className="content-h2" key={idx}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 className="content-h3" key={idx}>{line.slice(4)}</h3>);
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
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
