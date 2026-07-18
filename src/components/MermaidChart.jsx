import React, { useEffect, useRef, useState } from 'react';

let mermaidId = 0;
let mermaidReady = false;
let currentTheme = null;

// 简单清洗：移除潜在的脚本注入
function sanitizeSvg(svg) {
  if (!svg) return svg;
  // 移除 script 标签和 on* 事件处理器
  return svg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s/>]+/gi, '');
}

// 获取当前主题
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

// 懒加载 mermaid
async function initMermaid(theme) {
  if (mermaidReady && theme === currentTheme) return true;

  const isDark = theme === 'dark';
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: isDark ? {
        primaryColor: '#4a4458',
        primaryTextColor: '#e6e1e5',
        primaryBorderColor: '#6750a4',
        lineColor: '#cac4d0',
        secondaryColor: '#4a4458',
        tertiaryColor: '#2b2930',
        background: '#1c1b1f',
        mainBkg: '#1c1b1f',
        nodeBorder: '#6750a4',
        clusterBkg: '#2b2930',
        titleColor: '#e6e1e5',
        edgeLabelBackground: '#1c1b1f',
        fontFamily: 'Roboto, "Noto Sans SC", sans-serif',
        fontSize: '14px'
      } : {
        primaryColor: '#d1e4ff',
        primaryTextColor: '#001d36',
        primaryBorderColor: '#0061a4',
        lineColor: '#535f70',
        secondaryColor: '#ecf2f8',
        tertiaryColor: '#fafcff',
        background: '#ffffff',
        mainBkg: '#fafcff',
        nodeBorder: '#0061a4',
        clusterBkg: '#f2f4f6',
        titleColor: '#1a1c1e',
        edgeLabelBackground: '#ffffff',
        fontFamily: 'Roboto, "Noto Sans SC", sans-serif',
        fontSize: '14px'
      },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, mirrorActors: false },
      gantt: { useMaxWidth: true }
    });
    mermaidReady = true;
    currentTheme = theme;
    return true;
  } catch (e) {
    console.error('Mermaid init error:', e);
    return false;
  }
}

export default function MermaidChart({ chart }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [svgContent, setSvgContent] = useState(null);
  const idRef = useRef(`mermaid-${++mermaidId}`);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!chart || !containerRef.current) return;
      setError(null);

      try {
        const mermaid = (await import('mermaid')).default;
        const theme = getCurrentTheme();
        if (!mermaidReady || theme !== currentTheme) {
          await initMermaid(theme);
        }
        if (cancelled) return;

        const { svg } = await mermaid.render(idRef.current, chart);
        if (!cancelled) {
          setSvgContent(sanitizeSvg(svg));
        }
      } catch (e) {
        console.error('Mermaid render error:', e);
        if (!cancelled) {
          setError(e.message);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="mermaid-container error">
        <pre>{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container"
      dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
    />
  );
}
