<script setup>
import { ref, watch, onMounted } from 'vue';
import { useTheme } from '../composables/useTheme.js';

const props = defineProps({
  chart: { type: String, default: '' }
});

let mermaidId = 0;
let mermaidReady = false;
let currentTheme = null;

const svgContent = ref(null);
const error = ref(null);
const instanceId = `mermaid-${++mermaidId}`;

const { theme } = useTheme();

function sanitizeSvg(svg) {
  if (!svg) return svg;
  return svg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s/>]+/gi, '');
}

// 从动态令牌读取当前色（让 mermaid 跟随 Material You 种子色）
function getThemeVariables(isDark) {
  const cs = getComputedStyle(document.documentElement);
  const get = (name) => cs.getPropertyValue(name).trim() || undefined;
  if (isDark) {
    return {
      primaryColor: get('--md-sys-color-primary-container') || '#4a4458',
      primaryTextColor: get('--md-sys-color-on-surface') || '#e6e1e5',
      primaryBorderColor: get('--md-sys-color-primary') || '#6750a4',
      lineColor: get('--md-sys-color-outline-variant') || '#cac4d0',
      secondaryColor: get('--md-sys-color-secondary-container') || '#4a4458',
      tertiaryColor: get('--md-sys-color-surface-container-low') || '#2b2930',
      background: get('--md-sys-color-surface') || '#1c1b1f',
      mainBkg: get('--md-sys-color-surface') || '#1c1b1f',
      nodeBorder: get('--md-sys-color-primary') || '#6750a4',
      clusterBkg: get('--md-sys-color-surface-container-low') || '#2b2930',
      titleColor: get('--md-sys-color-on-surface') || '#e6e1e5',
      edgeLabelBackground: get('--md-sys-color-surface') || '#1c1b1f',
      fontFamily: 'Roboto Flex, "Noto Sans SC", sans-serif',
      fontSize: '14px'
    };
  }
  return {
    primaryColor: get('--md-sys-color-primary-container') || '#d1e4ff',
    primaryTextColor: get('--md-sys-color-on-surface') || '#001d36',
    primaryBorderColor: get('--md-sys-color-primary') || '#0061a4',
    lineColor: get('--md-sys-color-outline-variant') || '#535f70',
    secondaryColor: get('--md-sys-color-secondary-container') || '#ecf2f8',
    tertiaryColor: get('--md-sys-color-surface-bright') || '#fafcff',
    background: get('--md-sys-color-surface') || '#ffffff',
    mainBkg: get('--md-sys-color-surface') || '#fafcff',
    nodeBorder: get('--md-sys-color-primary') || '#0061a4',
    clusterBkg: get('--md-sys-color-surface-container-low') || '#f2f4f6',
    titleColor: get('--md-sys-color-on-surface') || '#1a1c1e',
    edgeLabelBackground: get('--md-sys-color-surface') || '#ffffff',
    fontFamily: 'Roboto Flex, "Noto Sans SC", sans-serif',
    fontSize: '14px'
  };
}

async function initMermaid(themeMode) {
  if (mermaidReady && themeMode === currentTheme) return true;
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: getThemeVariables(themeMode === 'dark'),
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, mirrorActors: false },
      gantt: { useMaxWidth: true }
    });
    mermaidReady = true;
    currentTheme = themeMode;
    return true;
  } catch (e) {
    console.error('Mermaid init error:', e);
    return false;
  }
}

async function render() {
  if (!props.chart) return;
  error.value = null;
  try {
    const mermaid = (await import('mermaid')).default;
    const ok = await initMermaid(theme.value);
    if (!ok) return;
    const { svg } = await mermaid.render(instanceId, props.chart);
    svgContent.value = sanitizeSvg(svg);
  } catch (e) {
    console.error('Mermaid render error:', e);
    error.value = e.message;
  }
}

// chart 或主题变化都重渲
watch(() => props.chart, render, { immediate: true });
watch(theme, async () => {
  mermaidReady = false;
  await render();
});
</script>

<template>
  <div v-if="error" class="mermaid-container error">
    <pre>{{ chart }}</pre>
  </div>
  <div
    v-else
    class="mermaid-container"
    v-html="svgContent"
  ></div>
</template>
