'use client';

import TopNav from '@/components/layout/TopNav';
import { MOCK_DRIFT_DATA, getScoreColor } from '@/lib/mock-data';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import { Upload, AlertTriangle, TrendingDown, Calendar, Database, ArrowRight } from 'lucide-react';
import { useState } from 'react';

export default function DriftPage() {
  const [showUpload, setShowUpload] = useState(false);
  const data = MOCK_DRIFT_DATA;
  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const scoreDelta = latest.fairnessScore - previous.fairnessScore;

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Drift Monitor' }]} />

      <div className="flex-1 p-5 space-y-3 animate-fade-in">
        {/* Alert Banner */}
        {latest.diRace < 0.8 && (
          <div
            className="card flex items-center gap-3"
            style={{ background: 'var(--danger-dim)', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
                Fairness Drift Alert
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Race DI ratio dropped to {latest.diRace.toFixed(2)} - below 0.80 legal threshold. Score dropped {Math.abs(scoreDelta)} points since last batch.
              </div>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => (window.location.href = '/audit/aud-001')}
            >
              View Audit <ArrowRight size={12} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Current Score</div>
            <div className="text-xl font-bold" style={{ color: getScoreColor(latest.fairnessScore) }}>{latest.fairnessScore}</div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Change</div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={16} style={{ color: 'var(--danger)' }} />
              <span className="text-xl font-bold" style={{ color: 'var(--danger)' }}>{scoreDelta}</span>
            </div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Batches</div>
            <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{data.length}</div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Latest Batch</div>
            <div className="text-xl font-bold">{latest.date}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="card" style={{ padding: '16px 12px' }}>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-semibold">Fairness Score & DI Ratio Over Time</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(!showUpload)}>
              <Upload size={13} /> Upload New Batch
            </button>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="score"
                domain={[0, 100]}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: 'var(--placeholder)', fontSize: 10 }}
              />
              <YAxis
                yAxisId="di"
                orientation="right"
                domain={[0, 1.2]}
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                label={{ value: 'DI Ratio', angle: 90, position: 'insideRight', fill: 'var(--placeholder)', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--fg)',
                }}
                itemStyle={{ color: 'var(--fg)' }}
              />
              <ReferenceLine yAxisId="di" y={0.8} stroke="var(--accent)" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '0.80 threshold', fill: 'var(--accent)', fontSize: 10, position: 'right' }} />
              <Area yAxisId="score" type="monotone" dataKey="fairnessScore" fill="var(--primary-dim)" stroke="none" />
              <Line yAxisId="score" type="monotone" dataKey="fairnessScore" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} name="Fairness Score" />
              <Line yAxisId="di" type="monotone" dataKey="diGender" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} name="DI - Gender" />
              <Line yAxisId="di" type="monotone" dataKey="diRace" stroke="var(--danger)" strokeWidth={2} dot={{ r: 3, fill: 'var(--danger)' }} name="DI - Race" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Upload Drawer */}
        {showUpload && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)' }}>
            <h3 className="text-sm font-semibold mb-3">Upload New Data Batch</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>
                  <Database size={11} className="inline mr-1" /> Data File
                </label>
                <div className="upload-zone py-6">
                  <Upload size={20} style={{ color: 'var(--primary)', margin: '0 auto 4px' }} />
                  <div className="text-xs">Drop CSV here</div>
                </div>
              </div>
              <div>
                <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>
                  <Calendar size={11} className="inline mr-1" /> Collection Date
                </label>
                <input type="date" className="input" />
              </div>
              <div>
                <label className="text-[11px] block mb-1" style={{ color: 'var(--muted)' }}>Notes</label>
                <textarea className="input" style={{ minHeight: 80 }} placeholder="Optional notes about this batch..." />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn btn-primary">
                <Upload size={13} /> Submit Batch
              </button>
            </div>
          </div>
        )}

        {/* Batch History */}
        <div className="card" style={{ padding: 0 }}>
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
            Batch History
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fairness Score</th>
                <th>DI - Gender</th>
                <th>DI - Race</th>
                <th>Batch Size</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((b, i) => (
                <tr key={i}>
                  <td className="font-medium">{b.date}</td>
                  <td>
                    <span style={{ color: getScoreColor(b.fairnessScore) }}>{b.fairnessScore}</span>
                  </td>
                  <td style={{ color: b.diGender < 0.8 ? 'var(--accent)' : 'var(--success)' }}>
                    {b.diGender.toFixed(2)}
                  </td>
                  <td style={{ color: b.diRace < 0.8 ? 'var(--danger)' : 'var(--success)' }}>
                    {b.diRace.toFixed(2)}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{b.batchSize.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
