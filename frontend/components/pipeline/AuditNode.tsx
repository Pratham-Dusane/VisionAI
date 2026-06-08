'use client';

import { Handle, Position } from 'reactflow';

interface AuditNodeData {
  auditName: string;
  domain: string;
  fairnessScore: number;
  letterGrade: string;
  auditId: string;
  localDi?: number;
  effectiveDi?: number;
  isAnalyzed?: boolean;
}

export function AuditNode({ data }: { data: AuditNodeData }) {
  const score = data.fairnessScore ?? 0;
  const scoreColor = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
  
  // Decide DI color
  const getDiColor = (val?: number) => {
    if (val === undefined) return 'var(--muted)';
    return val >= 0.8 ? 'var(--success)' : 'var(--danger)';
  };

  return (
    <div 
      className="card shadow-lg border-2" 
      style={{ 
        width: 200, 
        padding: '12px 14px', 
        borderColor: 'var(--border)', 
        background: 'var(--surface-2)',
        borderRadius: 12,
        position: 'relative'
      }}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ 
          background: 'var(--primary)', 
          width: 8, 
          height: 8, 
          border: '2px solid var(--surface)' 
        }} 
      />
      
      <div className="flex items-center justify-between mb-1.5">
        <span 
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
        >
          {data.domain || 'Audit'}
        </span>
        <span 
          className="text-xs font-black px-1.5 py-0.5 rounded" 
          style={{ background: scoreColor + '22', color: scoreColor }}
        >
          {data.letterGrade || 'N/A'}
        </span>
      </div>

      <h4 className="text-xs font-semibold truncate mb-2" style={{ color: 'var(--fg)' }} title={data.auditName}>
        {data.auditName}
      </h4>

      <div className="space-y-1 pt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex justify-between items-center text-[11px]">
          <span style={{ color: 'var(--muted)' }}>Fairness Score:</span>
          <span className="font-bold" style={{ color: scoreColor }}>{score}</span>
        </div>

        {data.isAnalyzed && (
          <>
            {data.localDi !== undefined && (
              <div className="flex justify-between items-center text-[10px]">
                <span style={{ color: 'var(--muted)' }}>Local DI:</span>
                <span className="font-semibold" style={{ color: getDiColor(data.localDi) }}>
                  {data.localDi.toFixed(2)}
                </span>
              </div>
            )}
            {data.effectiveDi !== undefined && (
              <div className="flex justify-between items-center text-[10px]">
                <span style={{ color: 'var(--muted)' }}>Effective DI:</span>
                <span className="font-bold px-1 rounded" style={{ background: getDiColor(data.effectiveDi) + '15', color: getDiColor(data.effectiveDi) }}>
                  {data.effectiveDi.toFixed(2)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ 
          background: 'var(--primary)', 
          width: 8, 
          height: 8, 
          border: '2px solid var(--surface)' 
        }} 
      />
    </div>
  );
}
