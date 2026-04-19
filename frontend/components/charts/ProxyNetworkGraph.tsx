'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

interface ProxyNode {
  id: string;
  type: 'protected' | 'proxy' | 'safe';
  explanation?: string;
}

interface ProxyLink {
  source: string;
  target: string;
  strength: number;
  riskLevel: 'HIGH' | 'MEDIUM';
  method?: string;
}

interface ProxyNetworkGraphProps {
  proxies: Array<{
    proxy_column: string;
    protected_column: string;
    association_score: number;
    risk_level: 'HIGH' | 'MEDIUM';
    method?: string;
    explanation?: string;
  }>;
  protectedCols: string[];
  allColumns?: string[];
}

export default function ProxyNetworkGraph({ proxies, protectedCols, allColumns }: ProxyNetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const MAX_RENDERED_EDGES = 120;
  const renderProxies = proxies
    .slice()
    .sort((a, b) => b.association_score - a.association_score)
    .slice(0, MAX_RENDERED_EDGES);
  const wasTrimmed = proxies.length > renderProxies.length;
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; content: string; title: string; risk: string;
  } | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || renderProxies.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 380;

    // Build nodes and links
    const nodeSet = new Set<string>();
    const links: ProxyLink[] = [];

    renderProxies.forEach((p) => {
      nodeSet.add(p.protected_column);
      nodeSet.add(p.proxy_column);
      links.push({
        source: p.protected_column,
        target: p.proxy_column,
        strength: p.association_score,
        riskLevel: p.risk_level,
        method: p.method,
      });
    });

    const nodes: (ProxyNode & { x?: number; y?: number; fx?: number | null; fy?: number | null })[] = Array.from(nodeSet).map((id) => {
      const isProtected = protectedCols.includes(id);
      const isProxy = renderProxies.some((p) => p.proxy_column === id);
      return {
        id,
        type: isProtected ? 'protected' : isProxy ? 'proxy' : 'safe',
        explanation: renderProxies.find((p) => p.proxy_column === id)?.explanation,
      };
    });

    // Clear
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // Colors
    const nodeColor = (type: string) => {
      if (type === 'protected') return '#FF165D';
      if (type === 'proxy') return '#FF9A00';
      return '#5A6478';
    };

    const linkColor = (risk: string) => risk === 'HIGH' ? '#FF165D' : '#FF9A00';

    // Force simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(40));

    // Draw links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => linkColor(d.riskLevel))
      .attr('stroke-width', (d) => Math.max(1.5, d.strength * 6))
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', (d) => d.riskLevel === 'MEDIUM' ? '4 2' : 'none');

    // Link labels
    const linkLabel = svg.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('fill', 'var(--placeholder)')
      .attr('font-size', 9)
      .attr('text-anchor', 'middle')
      .text((d) => d.strength.toFixed(2));

    // Draw nodes
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer');

    const dragBehavior = d3.drag<SVGGElement, any>()
      .on('start', (event, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(dragBehavior as any);

    // Node circles
    node.append('circle')
      .attr('r', (d) => d.type === 'protected' ? 20 : 16)
      .attr('fill', (d) => nodeColor(d.type))
      .attr('fill-opacity', 0.15)
      .attr('stroke', (d) => nodeColor(d.type))
      .attr('stroke-width', 2);

    // Node labels
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', 'var(--fg)')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .text((d) => {
        const name = d.id;
        return name.length > 10 ? name.slice(0, 10) + '…' : name;
      });

    // Node click handler
    node.on('click', (event, d: any) => {
      const svgRect = svgRef.current!.getBoundingClientRect();
      const proxy = renderProxies.find((p) => p.proxy_column === d.id || p.protected_column === d.id);
      setTooltip({
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top,
        title: d.id,
        risk: d.type === 'protected' ? 'PROTECTED' : proxy?.risk_level || 'SAFE',
        content: d.explanation || proxy?.explanation || (d.type === 'protected'
          ? `'${d.id}' is a protected attribute being analyzed for bias.`
          : `No proxy relationship detected.`),
      });
    });

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 6);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [renderProxies, protectedCols]);

  if (renderProxies.length === 0) return null;

  return (
    <div className="card" style={{ padding: '16px 12px', position: 'relative' }}>
      <div className="flex items-center justify-between mb-3 px-2">
        <h4 className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          Proxy Variable Network Graph
        </h4>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#FF165D' }} />
            Protected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#FF9A00' }} />
            Proxy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#5A6478' }} />
            Safe
          </span>
        </div>
      </div>
      {wasTrimmed && (
        <div className="text-xs px-2 mb-1" style={{ color: 'var(--accent)' }}>
          Showing top {renderProxies.length} strongest proxy links (of {proxies.length}) for smoother rendering.
        </div>
      )}
      <div ref={containerRef} style={{ position: 'relative' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />

        {/* Tooltip panel */}
        {tooltip && (
          <div
            className="absolute p-3 rounded-lg shadow-xl"
            style={{
              left: Math.min(tooltip.x + 10, (containerRef.current?.clientWidth || 400) - 260),
              top: tooltip.y + 10,
              width: 250,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              zIndex: 50,
            }}
          >
            <button
              className="absolute top-1 right-2 text-xs"
              style={{ color: 'var(--placeholder)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onClick={() => setTooltip(null)}
            >
              ✕
            </button>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>{tooltip.title}</span>
              <span className={`badge ${tooltip.risk === 'HIGH' ? 'badge-critical' : tooltip.risk === 'PROTECTED' ? 'badge-high' : 'badge-medium'}`}
                style={{ fontSize: 9, padding: '1px 6px' }}>
                {tooltip.risk}
              </span>
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
              {tooltip.content}
            </div>
          </div>
        )}
      </div>
      <div className="text-xs px-2 mt-2" style={{ color: 'var(--placeholder)' }}>
        Drag nodes to rearrange. Click a node for details. Line thickness = correlation strength.
      </div>
    </div>
  );
}
