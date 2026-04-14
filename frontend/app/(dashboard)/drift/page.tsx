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

      <div className="flex-1 p-4 space-y-3 animate-fade-in">
        {/* Alert Banner */}
        {latest.diRace < 0.8 && (
          <div
            className="card flex items-center gap-3"
            style={{ background: 'rgba(255, 22, 93, 0.06)', borderColor: 'rgba(255, 22, 93, 0.3)' }}
          >
            <AlertTriangle size={18} style={{ color: '#FF165D' }} />
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: '#FF165D' }}>
                Fairness Drift Alert
              </div>
              <div className="text-xs" style={{ color: '#8892A5' }}>
                Race DI ratio dropped to {latest.diRace.toFixed(2)} — below 0.80 legal threshold. Score dropped {Math.abs(scoreDelta)} points since last batch.
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
            <div className="text-[11px] font-medium" style={{ color: '#8892A5' }}>Current Score</div>
            <div className="text-xl font-bold" style={{ color: getScoreColor(latest.fairnessScore) }}>{latest.fairnessScore}</div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: '#8892A5' }}>Change</div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={16} style={{ color: '#FF165D' }} />
              <span className="text-xl font-bold" style={{ color: '#FF165D' }}>{scoreDelta}</span>
            </div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: '#8892A5' }}>Batches</div>
            <div className="text-xl font-bold" style={{ color: '#3EC1D3' }}>{data.length}</div>
          </div>
          <div className="card">
            <div className="text-[11px] font-medium" style={{ color: '#8892A5' }}>Latest Batch</div>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1A1F2B" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#8892A5', fontSize: 11 }}
                axisLine={{ stroke: '#2A3040' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="score"
                domain={[0, 100]}
                tick={{ fill: '#8892A5', fontSize: 11 }}
                axisLine={{ stroke: '#2A3040' }}
                tickLine={false}
                label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: '#5A6478', fontSize: 10 }}
              />
              <YAxis
                yAxisId="di"
                orientation="right"
                domain={[0, 1.2]}
                tick={{ fill: '#8892A5', fontSize: 11 }}
                axisLine={{ stroke: '#2A3040' }}
                tickLine={false}
                label={{ value: 'DI Ratio', angle: 90, position: 'insideRight', fill: '#5A6478', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: '#141820',
                  border: '1px solid #2A3040',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#E8EAED',
                }}
                itemStyle={{ color: '#E8EAED' }}
              />
              <ReferenceLine yAxisId="di" y={0.8} stroke="#FF9A00" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: '0.80 threshold', fill: '#FF9A00', fontSize: 10, position: 'right' }} />
              <Area yAxisId="score" type="monotone" dataKey="fairnessScore" fill="rgba(62, 193, 211, 0.08)" stroke="none" />
              <Line yAxisId="score" type="monotone" dataKey="fairnessScore" stroke="#3EC1D3" strokeWidth={2.5} dot={{ r: 4, fill: '#3EC1D3', stroke: '#0B0E14', strokeWidth: 2 }} activeDot={{ r: 6 }} name="Fairness Score" />
              <Line yAxisId="di" type="monotone" dataKey="diGender" stroke="#FF9A00" strokeWidth={2} dot={{ r: 3, fill: '#FF9A00' }} name="DI — Gender" />
              <Line yAxisId="di" type="monotone" dataKey="diRace" stroke="#FF165D" strokeWidth={2} dot={{ r: 3, fill: '#FF165D' }} name="DI — Race" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Upload Drawer */}
        {showUpload && (
          <div className="card" style={{ borderColor: 'rgba(62, 193, 211, 0.3)' }}>
            <h3 className="text-sm font-semibold mb-3">Upload New Data Batch</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] block mb-1" style={{ color: '#8892A5' }}>
                  <Database size={11} className="inline mr-1" /> Data File
                </label>
                <div className="upload-zone py-6">
                  <Upload size={20} style={{ color: '#3EC1D3', margin: '0 auto 4px' }} />
                  <div className="text-xs">Drop CSV here</div>
                </div>
              </div>
              <div>
                <label className="text-[11px] block mb-1" style={{ color: '#8892A5' }}>
                  <Calendar size={11} className="inline mr-1" /> Collection Date
                </label>
                <input type="date" className="input" />
              </div>
              <div>
                <label className="text-[11px] block mb-1" style={{ color: '#8892A5' }}>Notes</label>
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
          <div className="px-4 py-2.5 text-xs font-semibold" style={{ borderBottom: '1px solid #2A3040', color: '#8892A5' }}>
            Batch History
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fairness Score</th>
                <th>DI — Gender</th>
                <th>DI — Race</th>
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
                  <td style={{ color: b.diGender < 0.8 ? '#FF9A00' : '#06D6A0' }}>
                    {b.diGender.toFixed(2)}
                  </td>
                  <td style={{ color: b.diRace < 0.8 ? '#FF165D' : '#06D6A0' }}>
                    {b.diRace.toFixed(2)}
                  </td>
                  <td style={{ color: '#8892A5' }}>{b.batchSize.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
