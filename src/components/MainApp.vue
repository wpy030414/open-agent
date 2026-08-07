<script setup>
import { ref, watch, onMounted, nextTick } from 'vue';
import TheSidebar from './TheSidebar.vue';
import HomeView from './HomeView.vue';
import ChatView from './ChatView.vue';
import { useChat } from '../composables/useChat.js';

const props = defineProps({
  user: { type: Object, required: true },
  onLogout: { type: Function, required: true }
});

const collapsed = ref(false);

// 缓存模块（首页快捷操作用）
const cachedModules = ref([]);

// 聊天 composable
const chat = useChat({ value: props.user });
const {
  conversations, activeConvId, input, loading,
  sendMessage, createConversation, selectConversation, deleteConversation,
  activeConv, lastAssistantIdx
} = chat;

// 获取缓存模块列表，按数据量排序取前 4
onMounted(() => {
  fetch('/api/cache')
    .then(res => res.json())
    .then(data => {
      const modules = Object.values(data.modules || {});
      cachedModules.value = modules
        .filter(m => m.totalCount > 0)
        .sort((a, b) => (b.totalCount || 0) - (a.totalCount || 0))
        .slice(0, 4);
    })
    .catch(e => console.error('获取缓存模块失败:', e));
});

// 自动滚动到底部
const messagesEndRef = ref(null);
watch(
  [activeConvId, () => activeConv()?.messages?.length],
  async () => {
    await nextTick();
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' });
  }
);
// 流式内容变化也滚动
watch(
  () => activeConv()?.messages?.at(-1)?.content,
  async () => {
    await nextTick();
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' });
  }
);

const handleKeyDown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage(input.value);
  }
};

const toggleSidebar = () => {
  collapsed.value = !collapsed.value;
};
</script>

<template>
  <div class="app-layout">
    <!-- 侧边栏 -->
    <TheSidebar
      :conversations="conversations"
      :active-conv-id="activeConvId"
      :collapsed="collapsed"
      :user="user"
      @new-chat="createConversation"
      @select="selectConversation"
      @delete="deleteConversation"
      @logout="onLogout"
    />

    <!-- 主区域 -->
    <main class="main-area" :class="{ 'sidebar-collapsed': collapsed }">
      <!-- main 顶部菜单按钮（左上角，独立） -->
      <div class="main-topbar">
        <md-icon-button
          toggle
          class="menu-btn"
          :class="{ collapsed }"
          :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="toggleSidebar"
        >
          <md-icon>{{ collapsed ? 'menu' : 'menu_open' }}</md-icon>
        </md-icon-button>
      </div>

      <div class="content-area">
        <HomeView
          v-if="!activeConv()"
          :user="user"
          :input="input"
          :loading="loading"
          :cached-modules="cachedModules"
          @update:input="input = $event"
          @send="sendMessage"
          @keydown="handleKeyDown"
        />
        <ChatView
          v-else
          :active-conv="activeConv()"
          :input="input"
          :loading="loading"
          :last-assistant-idx="lastAssistantIdx()"
          :messages-end-ref="messagesEndRef"
          @update:input="input = $event"
          @send="sendMessage"
          @keydown="handleKeyDown"
        />
      </div>
    </main>
  </div>
</template>
