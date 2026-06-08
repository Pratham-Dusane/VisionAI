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
      const coloredDot = dotString.replace(
        /\s*}\s*$/,
        `
        ${protectedCols.map(p => `"${p}" [style=filled, fillcolor="#FCE8E6", color="#EA4335", fontcolor="#EA4335", shape=box, style="filled,rounded"]`).join('\n')}
        ${mediators.map(m => `"${m}" [style=filled, fillcolor="#FEF7E0", color="#FBBC05", shape=box, style="filled,rounded"]`).join('\n')}
        "${labelCol}" [style=filled, fillcolor="#E6F4EA", color="#34A853", fontcolor="#34A853", shape=ellipse, style=filled]
        }`
      );
      
      graphviz(ref.current)
        .zoom(true)
        .fit(true)
        .renderDot(coloredDot);
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
      <div ref={ref} className="w-full h-[450px] border rounded-xl flex items-center justify-center overflow-hidden" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }} />
    </div>
  );
}
