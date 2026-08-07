import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  resolve: { dedupe: ['vue'] },
  // MWC 以未打包 ESM 发布（含 bare import），需让 vite 预构建
  optimizeDeps: {
    include: [
      '@material/web/button/filled-button.js',
      '@material/web/button/filled-tonal-button.js',
      '@material/web/button/outlined-button.js',
      '@material/web/button/text-button.js',
      '@material/web/iconbutton/icon-button.js',
      '@material/web/icon/icon.js',
      '@material/web/textfield/filled-text-field.js',
      '@material/web/textfield/outlined-text-field.js',
      '@material/web/list/list.js',
      '@material/web/list/list-item.js',
      '@material/web/menu/menu.js',
      '@material/web/menu/menu-item.js',
      '@material/web/progress/circular-progress.js',
      '@material/web/elevation/elevation.js',
      '@material/web/divider/divider.js',
      '@material/web/fab/fab.js',
      '@material/web/dialog/dialog.js',
      '@material/web/chips/assist-chip.js',
      '@material/web/chips/suggestion-chip.js',
      '@material/web/ripple/ripple.js',
      '@material/material-color-utilities'
    ]
  },
  build: {
    // 单文件输出：关闭 CSS 代码分割 + 内联动态导入
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
