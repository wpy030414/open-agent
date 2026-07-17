import React, { useEffect, useRef, useState } from 'react';

let mermaidId = 0;
let mermaidReady = false;

// 懒加载 mermaid（避免初始化问题）
async function initMermaid() {
  if (mermaidReady) return true;
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
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
      },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, mirrorActors: false },
      gantt: { useMaxWidth: true }
    });
    mermaidReady = true;
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
        if (!mermaidReady) {
          await initMermaid();
        }
        if (cancelled) return;

        const { svg } = await mermaid.render(idRef.current, chart);
        if (!cancelled) {
          setSvgContent(svg);
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
