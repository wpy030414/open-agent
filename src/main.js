import { createApp } from 'vue';
import './md.js';
import './styles/tokens.css';
import './styles/app.css';
import { useTheme } from './composables/useTheme.js';
import App from './App.vue';

// 先应用动态令牌，再挂载——保证 MWC 组件 connect 时已有颜色
useTheme();

createApp(App).mount('#root');
