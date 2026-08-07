<script setup>
import { h } from 'vue';
import MermaidChart from './MermaidChart.vue';
import { renderTextBlock } from '../utils/markdown.js';

const props = defineProps({
  content: { type: String, default: '' }
});

// 切分 mermaid 代码块，奇数段交给 MermaidChart
function renderParts() {
  const parts = props.content.split(/```mermaid([\s\S]*?)```/);
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return h(MermaidChart, { chart: part.trim(), key: 'm' + idx });
    }
    if (part) {
      return h('div', { class: 'text-block', key: 't' + idx }, renderTextBlock(part));
    }
    return null;
  }).filter(Boolean);
}

// 用渲染函数返回，保证 content 变化时重渲
const vnode = () => h('div', { class: 'message-content' }, renderParts());
</script>

<template>
  <component :is="vnode" />
</template>
