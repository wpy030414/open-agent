/**
 * markdown.js — 轻量 markdown 渲染（移植自 React TextBlock/renderInline）
 *
 * 手写解析器：h2/h3、无序/有序列表、GFM 表格、行内 `code` / **bold**。
 * 返回 Vue VNode 数组。不引入 markdown 库，保持与原版输出一致。
 */
import { h } from 'vue';

// 行内渲染：行内 code + 粗体
export function renderInline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*(?!\*))/g);
  return parts.filter(Boolean).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return h('code', { class: 'inline-code', key: i }, part.slice(1, -1));
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return h('strong', { key: i }, part.slice(2, -2));
    }
    return part;
  });
}

// 文本块渲染：逐行解析
export function renderTextBlock(content) {
  const lines = content.split('\n');
  const elements = [];
  let tableRows = [];
  let inTable = false;
  let key = 0;

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        h('div', { class: 'table-wrapper', key: 'table-' + (key++) }, [
          h('table', {}, [
            h('thead', {}, [
              h('tr', {}, tableRows[0].map((cell, i) =>
                h('th', { key: i }, renderInline(cell.trim()))
              ))
            ]),
            h('tbody', {}, tableRows.slice(1).map((row, ri) =>
              h('tr', { key: ri }, row.map((cell, ci) =>
                h('td', { key: ci }, renderInline(cell.trim()))
              ))
            ))
          ])
        ])
      );
      tableRows = [];
      inTable = false;
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.split('|').filter(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c.trim()))) {
        return; // 分隔行
      }
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      return;
    }

    if (inTable) flushTable();

    if (line.startsWith('## ')) {
      elements.push(h('h2', { key: key++ }, renderInline(line.slice(3))));
    } else if (line.startsWith('### ')) {
      elements.push(h('h3', { key: key++ }, renderInline(line.slice(4))));
    } else if (line.trim().startsWith('- ')) {
      const text = line.trim().slice(2);
      elements.push(h('div', { class: 'list-item', key: key++ }, [
        h('span', { class: 'list-bullet' }),
        h('span', {}, renderInline(text))
      ]));
    } else if (/^\d+\.\s/.test(line.trim())) {
      const match = line.trim().match(/^(\d+)\.\s(.*)$/);
      elements.push(h('div', { class: 'list-item ordered', key: key++ }, [
        h('span', { class: 'list-number' }, match[1] + '.'),
        h('span', {}, renderInline(match[2]))
      ]));
    } else if (line.trim()) {
      elements.push(h('p', { key: key++ }, renderInline(line)));
    }
  });

  if (inTable) flushTable();
  return elements;
}
