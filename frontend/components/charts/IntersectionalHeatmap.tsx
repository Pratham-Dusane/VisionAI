'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export function getContrastText(bgColorHexOrVar: string, isThemeDark: boolean): string {
  const clean = bgColorHexOrVar.trim().toLowerCase();
  
  if (clean.includes('var(--status-critical-dim)') || clean.includes('rgba(217, 48, 37')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--status-warning-dim)') || clean.includes('rgba(176, 96, 0')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--status-pass-dim)') || clean.includes('rgba(24, 128, 56')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--warning-dim)')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  if (clean.includes('var(--surface-2)')) {
    return isThemeDark ? '#F9FAFB' : '#111827';
  }
  
  if (clean.startsWith('rgba') || clean.startsWith('rgb')) {
    const match = clean.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      let a = 1.0;
      const matchFloat = clean.match(/[\d\.]+/g);
      if (matchFloat && matchFloat.length >= 4) {
        a = parseFloat(matchFloat[3]);
      }
      
      const bgR = isThemeDark ? 18 : 255;
      const bgG = isThemeDark ? 26 : 255;
      const bgB = isThemeDark ? 42 : 255;
      
      const blendR = r * a + bgR * (1 - a);
      const blendG = g * a + bgG * (1 - a);
      const blendB = b * a + bgB * (1 - a);
      
      const luminance = (0.2126 * blendR + 0.7152 * blendG + 0.0722 * blendB) / 255;
      return luminance > 0.5 ? '#111827' : '#F9FAFB';
    }
  }
  
  if (clean.startsWith('#')) {
    const r = parseInt(clean.slice(1, 3), 16) || 0;
    const g = parseInt(clean.slice(3, 5), 16) || 0;
    const b = parseInt(clean.slice(5, 7), 16) || 0;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.5 ? '#111827' : '#F9FAFB';
  }
  
  return isThemeDark ? '#F9FAFB' : '#111827';
}

interface IntersectionalHeatmapProps {
  data: Array<{
    group: string;
    col_a: string;
    val_a: string;
    col_b: string;
    val_b: string;
    sample_size: number;
    positive_rate: number;
    di_vs_overall: number | null;
    severity: string;
    low_confidence?: boolean;
    statistical_note?: string;
  }>;
}

export default function IntersectionalHeatmap({ data }: IntersectionalHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<any>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
    entry: IntersectionalHeatmapProps['data'][number];
  } | null>(null);

  // Extract available attribute pairs
  const pairs = new Map<string, { colA: string; colB: string }>();
  data.forEach((d) => {
    const key = `${d.col_a} × ${d.col_b}`;
    if (!pairs.has(key)) pairs.set(key, { colA: d.col_a, colB: d.col_b });
  });
  const pairKeys = Array.from(pairs.keys());

  // Auto-select first pair
  useEffect(() => {
    if (!selectedPair && pairKeys.length > 0) {
      setSelectedPair(pairKeys[0]);
    }
  }, [pairKeys.length]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !selectedPair || data.length === 0) return;

    const pair = pairs.get(selectedPair);
    if (!pair) return;

    // Filter to selected pair
    const filtered = data.filter(
      (d) => d.col_a === pair.colA && d.col_b === pair.colB
    );

    const rowValues = Array.from(new Set(filtered.map((d) => d.val_a)));
    const colValues = Array.from(new Set(filtered.map((d) => d.val_b)));

    const cellSize = Math.max(
      34,
      Math.min(
        Math.floor((containerRef.current.clientWidth - 120) / Math.max(colValues.length, 1)),
        56
      )
    );

    const margin = { top: 50, right: 20, bottom: 10, left: 120 };
    const width = margin.left + colValues.length * cellSize + margin.right;
    const height = margin.top + rowValues.length * cellSize + margin.bottom;
    const cellGap = 2;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const diColorScale = d3.scaleLinear<string>()
      .domain([0.5, 0.8, 1.1])
      .range(['#B42318', '#9EA5B3', '#157347'])
      .clamp(true);

    const colorScale = (di: number | null) => {
      if (di === null) return '#8B95A7';
      return diColorScale(di);
    };

    const opacityScale = (di: number | null) => {
      if (di === null) return 0.32;
      return 0.38 + Math.min(Math.abs(1 - di), 0.45) * 0.85;
    };

    const bgR = isDark ? 18 : 255;
    const bgG = isDark ? 26 : 255;
    const bgB = isDark ? 42 : 255;

    const getBlendedCellBg = (hexColor: string, di: number | null) => {
      if (di === null) return isDark ? '#121a2a' : '#FFFFFF';
      const r = parseInt(hexColor.slice(1,3), 16) || 0;
      const g = parseInt(hexColor.slice(3,5), 16) || 0;
      const b = parseInt(hexColor.slice(5,7), 16) || 0;
      const alpha = opacityScale(di);
      const blendR = r * alpha + bgR * (1 - alpha);
      const blendG = g * alpha + bgG * (1 - alpha);
      const blendB = b * alpha + bgB * (1 - alpha);
      const toHex = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0');
      return `#${toHex(blendR)}${toHex(blendG)}${toHex(blendB)}`;
    };

    const getContrastColor = (hexColor: string, di: number | null) => {
      const blendedBg = getBlendedCellBg(hexColor, di);
      return getContrastText(blendedBg, isDark);
    };

    // Axis labels (top)
    svg.append('g')
      .selectAll('text')
      .data(colValues)
      .join('text')
      .attr('x', (_, i) => margin.left + i * cellSize + cellSize / 2)
      .attr('y', margin.top - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--muted)')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text((d) => d.length > 10 ? d.slice(0, 10) + '…' : d);

    // Row labels (left)
    svg.append('g')
      .selectAll('text')
      .data(rowValues)
      .join('text')
      .attr('x', margin.left - 8)
      .attr('y', (_, i) => margin.top + i * cellSize + cellSize / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--muted)')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text((d) => d.length > 14 ? d.slice(0, 14) + '…' : d);

    // Cells
    const cells = svg.append('g');

    rowValues.forEach((rowVal, ri) => {
      colValues.forEach((colVal, ci) => {
        const entry = filtered.find(
          (d) => d.val_a === rowVal && d.val_b === colVal
        );

        const di = entry?.di_vs_overall ?? null;
        const x = margin.left + ci * cellSize;
        const y = margin.top + ri * cellSize;

        const cell = cells.append('g')
          .style('cursor', entry ? 'pointer' : 'default');

        // Background rect
        cell.append('rect')
          .attr('x', x + cellGap / 2)
          .attr('y', y + cellGap / 2)
          .attr('width', cellSize - cellGap)
          .attr('height', cellSize - cellGap)
          .attr('rx', 4)
          .attr('fill', colorScale(di))
          .attr('fill-opacity', opacityScale(di))
          .attr('stroke', colorScale(di))
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.45);

        // DI value text
        const cellTextFill = getContrastColor(colorScale(di), di);
        cell.append('text')
          .attr('x', x + cellSize / 2)
          .attr('y', y + cellSize / 2 + 1)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', cellTextFill)
          .attr('font-size', 13)
          .attr('font-weight', 700)
          .text(di !== null ? di.toFixed(2) : '-');

        // Sample size
        if (entry) {
          cell.append('text')
            .attr('x', x + cellSize / 2)
            .attr('y', y + cellSize / 2 + 14)
            .attr('text-anchor', 'middle')
            .attr('fill', cellTextFill)
            .attr('font-size', 8)
            .text(`n=${entry.sample_size}`);
        }

        // Click handler
        if (entry) {
          cell.on('click', () => {
            setSelectedCell(entry);
          })
            .on('mouseenter', (event) => {
              if (!containerRef.current) return;
              const [mx, my] = d3.pointer(event, containerRef.current);
              setHoveredCell({ x: mx + 12, y: my + 12, entry });
            })
            .on('mousemove', (event) => {
              if (!containerRef.current) return;
              const [mx, my] = d3.pointer(event, containerRef.current);
              setHoveredCell({ x: mx + 12, y: my + 12, entry });
            })
            .on('mouseleave', () => {
              setHoveredCell(null);
            });
        }
      });
    });

    // Axis labels
    svg.append('text')
      .attr('x', margin.left + (colValues.length * cellSize) / 2)
      .attr('y', margin.top - 35)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--primary)')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .text(pair.colB);

    svg.append('text')
      .attr('x', 14)
      .attr('y', margin.top + (rowValues.length * cellSize) / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--primary)')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('transform', `rotate(-90, 14, ${margin.top + (rowValues.length * cellSize) / 2})`)
      .text(pair.colA);

  }, [data, selectedPair]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Pair selector */}
      {pairKeys.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Attribute Pair:
          </label>
          <select
            className="select"
            value={selectedPair}
            onChange={(e) => { setSelectedPair(e.target.value); setSelectedCell(null); }}
            style={{ minWidth: 200 }}
          >
            {pairKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      )}

      <div className="card" style={{ padding: '16px 12px', position: 'relative' }}>
        <div className="flex items-center justify-between mb-3 px-2">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Intersectional Fairness Heatmap
          </h4>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: '#157347' }} />
              Near parity
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: '#9EA5B3' }} />
              Moderate delta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ background: '#B42318' }} />
              High impact
            </span>
          </div>
        </div>

        <div className="flex gap-4" style={{ position: 'relative' }}>
          <div ref={containerRef} className="flex-1 overflow-x-auto">
            <svg ref={svgRef} style={{ display: 'block' }} />
          </div>

          {hoveredCell && (
            <div
              className="pointer-events-none"
              style={{
                position: 'absolute',
                left: hoveredCell.x,
                top: hoveredCell.y,
                zIndex: 12,
                minWidth: 230,
                maxWidth: 280,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid color-mix(in srgb, var(--border) 75%, transparent)',
                background: 'color-mix(in srgb, var(--surface) 83%, transparent)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)',
                color: 'var(--fg)',
              }}
            >
              <div className="text-[11px] font-bold mb-1">{hoveredCell.entry.group}</div>
              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                DI: <strong style={{ color: 'var(--fg)' }}>{hoveredCell.entry.di_vs_overall?.toFixed(3) ?? '-'}</strong>
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
                Delta from parity: <strong style={{ color: 'var(--fg)' }}>
                  {hoveredCell.entry.di_vs_overall != null
                    ? `${hoveredCell.entry.di_vs_overall >= 1 ? '+' : ''}${(hoveredCell.entry.di_vs_overall - 1).toFixed(3)}`
                    : '-'}
                </strong>
              </div>
              <div className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--placeholder)' }}>
                Mathematical impact: {hoveredCell.entry.di_vs_overall == null
                  ? 'insufficient support for robust estimate.'
                  : hoveredCell.entry.di_vs_overall < 1
                    ? `${((1 - hoveredCell.entry.di_vs_overall) * 100).toFixed(1)}% lower positive outcome likelihood vs parity baseline.`
                    : `${((hoveredCell.entry.di_vs_overall - 1) * 100).toFixed(1)}% higher positive outcome likelihood vs parity baseline.`}
              </div>
            </div>
          )}

          {/* Side panel on cell click */}
          {selectedCell && (
            <div className="shrink-0 w-56 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <button
                className="float-right text-xs"
                style={{ color: 'var(--placeholder)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onClick={() => setSelectedCell(null)}
              >
                ✕
              </button>
              <div className="text-xs font-bold mb-2" style={{ color: 'var(--primary)' }}>
                {selectedCell.group}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>DI vs Overall</span>
                  <span style={{
                    color: selectedCell.di_vs_overall < 0.6 ? 'var(--danger)' :
                      selectedCell.di_vs_overall < 0.8 ? 'var(--accent)' : 'var(--success)',
                    fontWeight: 700,
                  }}>
                    {selectedCell.di_vs_overall?.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Positive Rate</span>
                  <span>{(selectedCell.positive_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Sample Size</span>
                  <span>{selectedCell.sample_size}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Severity</span>
                  <span className={`badge ${selectedCell.severity === 'CRITICAL' ? 'badge-critical' : selectedCell.severity === 'HIGH' ? 'badge-high' : 'badge-pass'}`}
                    style={{ 
                      fontSize: 9, 
                      padding: '1px 6px',
                      color: getContrastText(
                        selectedCell.severity === 'CRITICAL' ? 'var(--status-critical-dim)' :
                        selectedCell.severity === 'HIGH' ? 'var(--status-warning-dim)' : 'var(--status-pass-dim)',
                        isDark
                      )
                    }}>
                    {selectedCell.severity}
                  </span>
                </div>
                {selectedCell.low_confidence && (
                  <div
                    className="text-xs mt-1 p-2 rounded"
                    style={{
                      background: 'color-mix(in srgb, var(--warning-dim) 72%, var(--surface))',
                      border: '1px solid color-mix(in srgb, var(--warning) 36%, transparent)',
                      color: getContrastText('var(--warning-dim)', isDark),
                    }}
                  >
                    {selectedCell.statistical_note || 'Low confidence estimate (sample size under 30).'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="text-xs px-2 mt-2" style={{ color: 'var(--placeholder)' }}>
          Click any cell to see full metrics. Cell value = Disparate Impact vs overall positive rate.
        </div>
      </div>
    </div>
  );
}
