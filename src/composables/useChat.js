/**
 * useChat — SSE 流式对话 composable（Vue 版）
 * 从 React App.jsx sendMessage 移植。
 *
 * SSE 事件契约（与后端 /api/chat 一致）：
 *   meta / token / thinking / tool_call / tool_result / done / error
 */
import { ref, watch } from 'vue';
import { t } from '../i18n.js';

const CONV_KEY = 'ai-secretary-conversations';

function loadConversations() {
  try {
    const saved = localStorage.getItem(CONV_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export function useChat(userRef) {
  const conversations = ref(loadConversations());
  const activeConvId = ref(null);
  const input = ref('');
  const loading = ref(false);

  // 持久化对话
  watch(conversations, (v) => {
    localStorage.setItem(CONV_KEY, JSON.stringify(v));
  }, { deep: true });

  const activeConv = () => conversations.value.find(c => c.id === activeConvId.value);

  // 找最后一条 assistant 消息：追问 chip 只挂它下方
  const lastAssistantIdx = () => {
    const conv = activeConv();
    if (!conv) return -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'assistant') return i;
    }
    return -1;
  };

  // 流式更新当前对话最后一条消息（整体替换该消息对象，保证 Vue 响应式追踪）
  function setLastMsg(convId, patch) {
    const conv = conversations.value.find(c => c.id === convId);
    if (!conv) return;
    const msgs = conv.messages;
    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
  }

  function createConversation() {
    activeConvId.value = null;
    input.value = '';
  }

  function selectConversation(id) {
    activeConvId.value = id;
  }

  function deleteConversation(id, e) {
    if (e) e.stopPropagation();
    const next = conversations.value.filter(c => c.id !== id);
    conversations.value = next;
    if (activeConvId.value === id) {
      activeConvId.value = next.length > 0 ? next[0].id : null;
    }
  }

  async function sendMessage(text) {
    if (!text?.trim() || loading.value) return;

    const userMessage = { role: 'user', content: text.trim() };
    const placeholderMsg = { role: 'assistant', content: '', module: null, cacheHit: false, thinking: '', toolCalls: [], suggestions: [] };

    let convId = activeConvId.value;
    let history = [];

    if (!convId) {
      convId = `conv-${Date.now()}`;
      conversations.value = [{
        id: convId,
        title: text.trim().slice(0, 24) + (text.length > 24 ? '...' : ''),
        messages: [userMessage, placeholderMsg],
        createdAt: new Date().toISOString()
      }, ...conversations.value];
      activeConvId.value = convId;
      history = [userMessage];
    } else {
      const conv = conversations.value.find(c => c.id === convId);
      history = [...conv.messages, userMessage];
      conv.messages.push(placeholderMsg);
    }

    input.value = '';
    loading.value = true;

    const u = userRef.value || {};

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: history.slice(0, -1),
          user: {
            name: u.userName,
            role: u.role,
            dept: u.dept,
            userId: u.userId
          }
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      let streamedContent = '';
      let meta = { module: null, cacheHit: false };
      let suggestions = [];
      let thinkingText = '';
      const toolCallsAcc = [];

      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        streamedContent = data.reply || '';
        meta = { module: data.module, cacheHit: data.cacheHit };
        suggestions = data.suggestions || [];
      } else {
        // SSE 流模式
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            let event;
            try { event = JSON.parse(dataStr); } catch { continue; }

            switch (event.type) {
              case 'meta':
                meta = { module: event.module, cacheHit: event.cacheHit };
                break;
              case 'token':
                if (!streamedContent) loading.value = false;
                streamedContent += event.text;
                setLastMsg(convId, { content: streamedContent });
                break;
              case 'thinking':
                thinkingText += event.text || '';
                setLastMsg(convId, { thinking: thinkingText });
                break;
              case 'tool_call':
                toolCallsAcc.push({ name: event.name, input: event.input || {}, result: null });
                if (!streamedContent) loading.value = false;
                setLastMsg(convId, { toolCalls: [...toolCallsAcc] });
                break;
              case 'tool_result': {
                const last = toolCallsAcc[toolCallsAcc.length - 1];
                if (last) last.result = event.summary || event.error || '';
                setLastMsg(convId, { toolCalls: [...toolCallsAcc] });
                break;
              }
              case 'done':
                if (!streamedContent) streamedContent = event.reply || '';
                if (Array.isArray(event.suggestions)) suggestions = event.suggestions;
                break;
              case 'error':
                throw new Error(event.error || t('errors.aiCallFailed'));
            }
          }
        }
      }

      if (!streamedContent) streamedContent = t('errors.noReply');
      setLastMsg(convId, {
        role: 'assistant',
        content: streamedContent,
        module: meta.module,
        cacheHit: meta.cacheHit,
        suggestions,
        thinking: thinkingText,
        toolCalls: toolCallsAcc
      });
    } catch (e) {
      alert(`${t('errors.sendFailed')}: ${e.message}`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        const msgs = conv.messages;
        if (msgs.length >= 2 && msgs[msgs.length - 1].role === 'assistant' && !msgs[msgs.length - 1].content) {
          msgs.pop();
        }
        if (msgs.length >= 1 && msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content === text.trim()) {
          msgs.pop();
        }
      }
    } finally {
      loading.value = false;
    }
  }

  return {
    conversations, activeConvId, input, loading,
    sendMessage, createConversation, selectConversation, deleteConversation,
    activeConv, lastAssistantIdx, formatTime
  };
}
