'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ZAxis,
} from 'recharts';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface ParetoFrontierProps {
  auditId: string;
  hasModel: boolean;
  initialParetoData?: any;
}

interface ParetoPoint {
  threshold: number;
  accuracy: number;
  fairnessScore: number;
}

export default function ParetoFrontier({ auditId, hasModel, initialParetoData }: ParetoFrontierProps) {
  const [data, setData] = useState<ParetoPoint[]>(initialParetoData?.points || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedThreshold, setSelectedThreshold] = useState(0.5);
  const [fetched, setFetched] = useState(!!initialParetoData?.points);

  if (!hasModel) return null;

  const fetchPareto = async () => {
    setLoading(true);
    setError('');
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE}/api/audits/${auditId}/pareto`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to compute Pareto frontier' }));
        throw new Error(err.detail || 'Failed to compute Pareto frontier');
      }
      const result = await res.json();
      setData(result.points || []);
      setFetched(true);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedPoint = data.find((d) => d.threshold === selectedThreshold);

  if (!fetched) {
    return (
      <div className="card text-center py-8">
        <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--muted)' }}>
          Fairness vs Accuracy Pareto Frontier
        </h4>
        <p className="text-xs mb-4" style={{ color: 'var(--placeholder)' }}>
          Explore the trade-off between model accuracy and fairness at different decision thresholds.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={fetchPareto}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Computing...
            </>
          ) : (
            'Compute Pareto Frontier'
          )}
        </button>
        {error && (
          <div className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{error}</div>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card text-center py-6">
        <div className="text-sm" style={{ color: 'var(--placeholder)' }}>
          No Pareto data available.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '16px 12px' }}>
      <h4 className="text-xs font-semibold mb-1 px-2" style={{ color: 'var(--muted)' }}>
        Fairness vs Accuracy Pareto Frontier
      </h4>
      <p className="text-xs mb-3 px-2" style={{ color: 'var(--placeholder)' }}>
        Each point is a different decision threshold. Drag the slider to explore trade-offs.
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 24, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="accuracy"
            name="Accuracy"
            domain={['dataMin - 2', 'dataMax + 2']}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            label={{ value: 'Accuracy (%)', position: 'insideBottom', offset: -5, fill: 'var(--placeholder)', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="number"
            dataKey="fairnessScore"
            name="Fairness Score"
            domain={[0, 100]}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            label={{ value: 'Fairness Score', angle: -90, position: 'insideLeft', fill: 'var(--placeholder)', fontSize: 10 }}
          />
          <ZAxis range={[60, 200]} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--fg)',
            }}
            formatter={(value, name) => {
              const numericValue = Number(value ?? 0);
              const metricName = String(name ?? '');
              if (metricName === 'Accuracy') return [`${numericValue.toFixed(1)}%`, metricName];
              return [numericValue.toFixed(1), metricName];
            }}
          />
          <ReferenceLine y={80} stroke="var(--success)" strokeDasharray="6 3" strokeWidth={1}
            label={{ value: 'Grade A', fill: 'var(--success)', fontSize: 9, position: 'right' }} />
          <Scatter
            data={data}
            fill="#8A63FF"
            fillOpacity={0.7}
            stroke="#8A63FF"
            strokeWidth={1}
          />
          {selectedPoint && (
            <Scatter
              data={[selectedPoint]}
              fill="#FF165D"
              stroke="#FF165D"
              strokeWidth={2}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Threshold slider */}
      <div className="px-2 mt-3">
        <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--muted)' }}>
          <span>Decision Threshold</span>
          <span className="font-semibold" style={{ color: 'var(--primary)' }}>{selectedThreshold.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={0.9}
          step={0.1}
          value={selectedThreshold}
          onChange={(e) => setSelectedThreshold(parseFloat(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--primary)' }}
        />
        {selectedPoint && (
          <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--fg)' }}>
            <span>Accuracy: <strong style={{ color: 'var(--primary)' }}>{selectedPoint.accuracy.toFixed(1)}%</strong></span>
            <span>Fairness: <strong style={{ color: selectedPoint.fairnessScore >= 80 ? 'var(--success)' : selectedPoint.fairnessScore >= 50 ? 'var(--accent)' : 'var(--danger)' }}>{selectedPoint.fairnessScore.toFixed(1)}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
