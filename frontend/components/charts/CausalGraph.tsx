'use client';

import { useEffect, useRef } from 'react';
// @ts-ignore
import { graphviz } from 'd3-graphviz';

interface CausalGraphProps {
  dotString: string;
  protectedCols: string[];
  mediators: string[];
  labelCol: string;
}

export default function CausalGraph({ dotString, protectedCols, mediators, labelCol }: CausalGraphProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!ref.current || !dotString) return;
    
    try {
      // Find the last closing brace and insert custom styled node properties
      let coloredDot = dotString.replace(
        /\s*}\s*$/,
        `
        ${protectedCols.map(p => `"${p}" [style=filled, fillcolor="#FCE8E6", color="#EA4335", fontcolor="#EA4335", shape=box, style="filled,rounded"]`).join('\n')}
        ${mediators.map(m => `"${m}" [style=filled, fillcolor="#FEF7E0", color="#FBBC05", shape=box, style="filled,rounded"]`).join('\n')}
        "${labelCol}" [style=filled, fillcolor="#E6F4EA", color="#34A853", fontcolor="#34A853", shape=ellipse, style=filled]
        }`
      );

      // Inject transparent bgcolor settings directly after the opening brace
      const firstBrace = coloredDot.indexOf('{');
      if (firstBrace !== -1) {
        coloredDot = coloredDot.slice(0, firstBrace + 1) + 
          '\n  bgcolor="transparent";\n  graph [bgcolor="transparent"];\n  node [bgcolor="transparent"];\n' + 
          coloredDot.slice(firstBrace + 1);
      }
      
      graphviz(ref.current)
        .zoom(true)
        .fit(true)
        .renderDot(coloredDot)
        .on("end", () => {
          if (ref.current) {
            const svg = ref.current.querySelector('svg');
            if (svg) {
              svg.style.width = '100%';
              svg.style.height = '100%';
              
              // Set fill of the main polygon background of the graph to transparent
              const bgPolygon = svg.querySelector('polygon');
              if (bgPolygon) {
                bgPolygon.setAttribute('fill', 'transparent');
                bgPolygon.setAttribute('stroke', 'transparent');
              }
              
              // Set stroke/fill for normal nodes and edges to support dark/light mode
              const edges = svg.querySelectorAll('.edge');
              edges.forEach((edge: any) => {
                const path = edge.querySelector('path');
                const polygon = edge.querySelector('polygon');
                if (path) path.setAttribute('stroke', 'var(--fg)');
                if (polygon) {
                  polygon.setAttribute('stroke', 'var(--fg)');
                  polygon.setAttribute('fill', 'var(--fg)');
                }
              });
              
              const nodes = svg.querySelectorAll('.node');
              nodes.forEach((node: any) => {
                const title = node.querySelector('title')?.textContent || '';
                const cleanTitle = title.replace(/"/g, '').trim();
                const text = node.querySelectorAll('text');
                const polygon = node.querySelector('polygon');
                const ellipse = node.querySelector('ellipse');
                
                const isSpecial = protectedCols.includes(cleanTitle) || mediators.includes(cleanTitle) || cleanTitle === labelCol;
                
                if (!isSpecial) {
                  if (polygon) {
                    polygon.setAttribute('stroke', 'var(--border)');
                    polygon.setAttribute('fill', 'var(--surface)');
                  }
                  if (ellipse) {
                    ellipse.setAttribute('stroke', 'var(--border)');
                    ellipse.setAttribute('fill', 'var(--surface)');
                  }
                  text.forEach((t: any) => {
                    t.setAttribute('fill', 'var(--fg)');
                  });
                }
              });
            }
          }
        });
    } catch (err) {
      console.error("Failed to render causal graph:", err);
    }
  }, [dotString, protectedCols, mediators, labelCol]);
  
  return (
    <div className="relative w-full">
      <div className="flex gap-4 mb-4 text-xs font-semibold flex-wrap" style={{ color: 'var(--muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#FCE8E6', border: '1px solid #EA4335' }}/> 
          Protected Attribute
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#FEF7E0', border: '1px solid #FBBC05' }}/> 
          Mediator Feature
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#E6F4EA', border: '1px solid #34A853' }}/> 
          Outcome Variable
        </span>
      </div>
      <div ref={ref} className="w-full h-[380px] border rounded-xl flex items-center justify-center overflow-hidden" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }} />
      <div className="text-[11px] text-center mt-2" style={{ color: 'var(--placeholder)' }}>
        Scroll to zoom, drag to pan inside the causal graph.
      </div>
    </div>
  );
}
