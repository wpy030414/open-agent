/**
 * useTheme — Material You 动态配色
 *
 * 从种子色用 HCT 色彩系统生成完整 M3 色阶（SchemeTonalSpot），
 * 映射成 MWC 组件消费的 --md-sys-color-* CSS 自定义属性。
 * 主题模式 themeMode：system（跟随系统）/ light / dark，由设置弹窗选择。
 */
import { ref, watch, computed } from 'vue';
import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot } from '@material/material-color-utilities';

const SEED_KEY = 'ai-secretary-seed';
const THEME_MODE_KEY = 'ai-secretary-theme-mode';

// 内置色板：蓝 绿 粉
export const PRESET_SEEDS = [
  { name: '蓝', hex: '#0061a4' },
  { name: '绿', hex: '#386a20' },
  { name: '粉', hex: '#984061' },
];

// Scheme 实例 → {tokenName: hex}（camelCase → kebab-case）
// 颜色属性分布在整条原型链上（Scheme 继承自基类），需遍历完整原型链
function schemeToCssVars(scheme) {
  const out = {};
  let proto = scheme;
  while (proto && proto !== Object.prototype) {
    for (const camel of Object.getOwnPropertyNames(proto)) {
      if (camel === 'constructor') continue;
      const val = scheme[camel];
      if (typeof val !== 'number' || typeof scheme[camel] === 'function') continue; // 只取 argb 颜色值
      const kebab = '--md-sys-color-' + camel.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (!(kebab in out)) out[kebab] = hexFromArgb(val);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return out;
}

function detectSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// 用户选择的主题模式：system / light / dark
export const themeMode = ref(localStorage.getItem(THEME_MODE_KEY) || 'system');
// 实际生效的 light/dark（由 themeMode + 系统偏好派生）
export const theme = ref(computeTheme());
export const seed = ref(localStorage.getItem(SEED_KEY) || PRESET_SEEDS[0].hex);

function computeTheme() {
  if (themeMode.value === 'light') return 'light';
  if (themeMode.value === 'dark') return 'dark';
  return detectSystemTheme(); // system
}

let styleTag = null;
let watchInstalled = false;
let mqListenerInstalled = false;

function render() {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.value);
  localStorage.setItem(SEED_KEY, seed.value);
  localStorage.setItem(THEME_MODE_KEY, themeMode.value);

  const source = argbFromHex(seed.value);
  const hct = Hct.fromInt(source);
  const light = new SchemeTonalSpot(hct, false, 0.0);
  const dark = new SchemeTonalSpot(hct, true, 0.0);

  // 浅色 + 暗色都写入样式表规则（:root + [data-theme="dark"]）
  // 属性选择器 [data-theme="dark"] 特异性高于 :root，dark 模式下正确覆盖
  const lightVars = schemeToCssVars(light);
  const darkVars = schemeToCssVars(dark);
  const css =
    ':root{\n' + Object.entries(lightVars).map(([k, v]) => `${k}:${v};`).join('\n') + '\n}\n' +
    '[data-theme="dark"]{\n' + Object.entries(darkVars).map(([k, v]) => `${k}:${v};`).join('\n') + '\n}';
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'md-dynamic-color';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = css;
}

export function useTheme() {
  const setSeed = (h) => { seed.value = h; };
  const setThemeMode = (m) => {
    themeMode.value = m;
    theme.value = computeTheme();
  };
  if (!watchInstalled) {
    watch([theme, seed], render, { immediate: true });
    watchInstalled = true;
  }
  // 监听系统主题变化，仅 themeMode==='system' 时跟随
  if (!mqListenerInstalled) {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', (e) => {
      if (themeMode.value === 'system') {
        theme.value = e.matches ? 'dark' : 'light';
      }
    });
    mqListenerInstalled = true;
  }
  return { theme, themeMode, seed, setSeed, setThemeMode, presetSeeds: PRESET_SEEDS };
}
