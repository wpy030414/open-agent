<script setup>
import { ref, watch } from 'vue';
import { t } from '../i18n.js';
import { useTheme } from '../composables/useTheme.js';

const props = defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(['update:open', 'logout']);

const { themeMode, setThemeMode } = useTheme();

const MODES = [
  { value: 'system', label: t('settings.themeSystem'), icon: 'desktop_windows' },
  { value: 'light', label: t('settings.themeLight'), icon: 'light_mode' },
  { value: 'dark', label: t('settings.themeDark'), icon: 'dark_mode' },
];

const dialogRef = ref(null);

// 原生 <dialog> showModal/close：浏览器自动居中 + ::backdrop 遮罩
watch(() => props.open, (val) => {
  const d = dialogRef.value;
  if (!d) return;
  if (val && !d.open) {
    d.showModal();
  } else if (!val && d.open) {
    d.close();
  }
});

const handleClose = () => emit('update:open', false);
const handleLogout = () => {
  emit('logout');
  handleClose();
};
</script>

<template>
  <dialog ref="dialogRef" class="settings-dialog" @close="handleClose">
    <div class="settings-dialog-headline">{{ t('settings.title') }}</div>

    <form class="settings-content" method="dialog">
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settings.theme') }}</div>
        <div class="theme-options">
          <button
            v-for="m in MODES"
            :key="m.value"
            type="button"
            :class="['theme-option', { active: themeMode === m.value }]"
            @click="setThemeMode(m.value)"
          >
            <md-icon>{{ m.icon }}</md-icon>
            <span>{{ m.label }}</span>
          </button>
        </div>
      </div>
    </form>

    <div class="settings-actions">
      <md-text-button type="button" class="logout-btn" @click="handleLogout">
        <md-icon slot="icon">logout</md-icon>
        {{ t('user.logout') }}
      </md-text-button>
      <md-text-button type="button" value="close" @click="handleClose">
        {{ t('settings.close') }}
      </md-text-button>
    </div>
  </dialog>
</template>
