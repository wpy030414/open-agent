<script setup>
import { ref } from 'vue';
import { useTheme } from '../composables/useTheme.js';
import { t } from '../i18n.js';

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  activeConvId: { type: [String, null], default: null },
  collapsed: { type: Boolean, default: false },
  user: { type: Object, default: null }
});

const emit = defineEmits(['new-chat', 'select', 'delete', 'logout']);

const { themeMode, setThemeMode } = useTheme();

const MODES = [
  { value: 'system', label: t('settings.themeSystem'), icon: 'desktop_windows' },
  { value: 'light', label: t('settings.themeLight'), icon: 'light_mode' },
  { value: 'dark', label: t('settings.themeDark'), icon: 'dark_mode' },
];

// 气泡菜单（md-menu + popover API，顶层渲染，不会被侧边栏 overflow:hidden 裁切）
const settingsMenuRef = ref(null);

const toggleMenu = () => {
  const m = settingsMenuRef.value;
  if (!m) return;
  if (m.open) m.close();
  else m.show();
};

const onMenuClosed = () => { /* 状态由组件自身维护，无需额外处理 */ };

const onLogout = () => {
  emit('logout');
  settingsMenuRef.value?.close();
};

const formatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

const onDelete = (id, e) => emit('delete', id, e);
</script>

<template>
  <aside :class="['sidebar', { collapsed }]">
    <div class="sidebar-content">
      <!-- 顶部品牌区 -->
      <div class="sidebar-header">
        <md-icon class="brand-icon">smart_toy</md-icon>
        <span class="brand-name">{{ t('product.name') }}</span>
      </div>

      <button class="new-chat-btn" @click="$emit('new-chat')">
        <md-icon>add</md-icon>
        <span>{{ t('app.sidebar.newChat') }}</span>
      </button>

      <nav class="conversation-list">
        <div v-if="conversations.length === 0" class="empty-state">{{ t('app.sidebar.emptyState') }}</div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conversation-item', { active: activeConvId === conv.id }]"
          @click="$emit('select', conv.id)"
        >
          <md-icon>chat</md-icon>
          <div class="conversation-info">
            <div class="conversation-title">{{ conv.title }}</div>
            <div class="conversation-time">{{ formatTime(conv.createdAt) }}</div>
          </div>
          <button
            class="delete-btn"
            :title="t('app.sidebar.deleteConversation')"
            @click="onDelete(conv.id, $event)"
          >
            <md-icon>delete</md-icon>
          </button>
        </div>
      </nav>

      <!-- 底部用户区 -->
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <img v-if="user?.avatar" class="user-avatar" :src="user.avatar" alt="" />
          <md-icon v-else class="user-avatar-icon">account_circle</md-icon>
          <span class="user-name">{{ user?.userName || t('user.defaultName') }}</span>
          <md-icon-button
            id="settings-anchor"
            class="settings-btn"
            :title="t('app.sidebar.settings')"
            @click="toggleMenu"
          >
            <md-icon>settings</md-icon>
          </md-icon-button>
        </div>
      </div>
    </div>

    <!-- 设置气泡菜单：锚定到设置按钮，顶层渲染避免被裁切 -->
    <md-menu
      ref="settingsMenuRef"
      anchor="settings-anchor"
      positioning="popover"
      anchor-corner="top-end"
      menu-corner="bottom-end"
      style="min-width: 220px"
      @closed="onMenuClosed"
    >
      <!-- 主题：内联下拉切换 -->
      <md-menu-item type="none" class="menu-label">
        <span slot="headline" class="menu-label-text">{{ t('settings.theme') }}</span>
      </md-menu-item>
      <md-menu-item
        v-for="m in MODES"
        :key="m.value"
        @click="setThemeMode(m.value)"
      >
        <md-icon slot="start">{{ m.icon }}</md-icon>
        <span slot="headline">{{ m.label }}</span>
        <md-icon
          v-if="themeMode === m.value"
          slot="end"
          class="menu-check"
        >check</md-icon>
      </md-menu-item>
      <md-divider role="separator"></md-divider>
      <md-menu-item class="logout-item" @click="onLogout">
        <md-icon slot="start">logout</md-icon>
        <span slot="headline">{{ t('user.logout') }}</span>
      </md-menu-item>
    </md-menu>
  </aside>
</template>
