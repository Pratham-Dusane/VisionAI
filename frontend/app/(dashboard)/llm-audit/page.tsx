'use client';

import { useState, useMemo } from 'react';
import TopNav from '@/components/layout/TopNav';
import { runLLMBiasScan } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Brain,
  MessageSquare,
  Search,
  Sliders,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Database,
  ArrowRight,
} from 'lucide-react';

interface GroupOutput {
  responses: string[];
  mean_toxicity: number;
  mean_sentiment: number;
}

interface AttributeResult {
  group_outputs: Record<string, GroupOutput>;
  toxicity_disparity: number;
  sentiment_disparity: number;
  toxicity_flagged: boolean;
  sentiment_flagged: boolean;
  worst_toxicity_group: string | null;
  lowest_sentiment_group: string | null;
}

interface LLMBiasResponse {
  stereotype_amplification: Record<string, AttributeResult>;
  retrieval_bias: {
    retrieval_similarity_by_group: Record<string, number | null>;
    similarity_disparity: number;
    retrieval_bias_flagged: boolean;
    retrieved_doc_samples: Record<string, string[]>;
  };
}

// Simple markdown renderer for LLM output responses
const renderMarkdown = (md: string) => {
  const lines = md.split('\n');
  const elements: any[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="space-y-1 ml-4 mb-3 list-disc">
          {listItems.map((item, j) => (
            <li key={j} className="text-xs" style={{ color: 'var(--fg)' }}>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const inlineFormat = (text: string) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--fg)">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface-2);padding:1px 4px;border-radius:3px;font-size:10px;color:var(--primary);border:1px solid var(--border)">$1</code>');
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} className="text-sm font-bold mb-2 mt-4" style={{ color: 'var(--fg)' }}>{line.slice(2)}</h2>);
    } else if (line.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} className="text-xs font-bold mb-2 mt-3" style={{ color: 'var(--primary)' }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={i} className="text-[11px] font-bold mb-1 mt-2" style={{ color: 'var(--primary)' }}>{line.slice(4)}</h4>);
    } else if (line.startsWith('---')) {
      flushList();
      elements.push(<hr key={i} className="my-3" style={{ borderColor: 'var(--border)' }} />);
    } else if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
      const content = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      listItems.push(content);
    } else if (line === '') {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={i} className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--fg)' }}
          dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      );
    }
  }
  flushList();
  return elements;
};

export default function LLMAuditPage() {
  const { org } = useAuth();
  
  // Connection Inputs
  const [llmEndpoint, setLlmEndpoint] = useState('mock-llm-service');
  const [llmApiKey, setLlmApiKey] = useState('mock-key-123');
  const [modelName, setModelName] = useState('');
  const [domain, setDomain] = useState('hiring');
  const [ragEndpoint, setRagEndpoint] = useState('');
  
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<LLMBiasResponse | null>(null);
  
  // Accordion state for prompt responses
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Pre-populate Mock URLs for easy testing
  const handlePrepopulateMocks = () => {
    setLlmEndpoint('mock-llm-service');
    setLlmApiKey('mock-key-123');
    setRagEndpoint('mock-rag-service');
    setModelName('');
    setError('');
  };

  const handleRunScan = async () => {
    if (!org?.id) {
      setError('Please select or verify your organization context first.');
      return;
    }
    if (!llmEndpoint) {
      setError('Please specify the LLM API endpoint.');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);
    setExpandedGroup(null);

    try {
      const payload = await runLLMBiasScan({
        llm_endpoint: llmEndpoint,
        llm_api_key: llmApiKey,
        domain: domain,
        org_id: org.id,
        model_name: modelName || undefined,
        rag_endpoint: ragEndpoint || undefined,
      });
      setResults(payload);
    } catch (err: any) {
      setError(err.message || 'The scan run encountered an unexpected server error.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to color-code sentiment
  const getSentimentStyle = (score: number) => {
    if (score >= 0.1) {
      const opacity = Math.min(0.85, 0.15 + score * 0.7);
      return {
        background: `rgba(16, 185, 129, ${opacity})`, // emerald-500
        color: opacity > 0.45 ? '#ffffff' : 'var(--fg)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
      };
    } else if (score <= -0.1) {
      const opacity = Math.min(0.85, 0.15 + Math.abs(score) * 0.7);
      return {
        background: `rgba(239, 68, 68, ${opacity})`, // red-500
        color: opacity > 0.45 ? '#ffffff' : 'var(--fg)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
      };
    }
    return {
      background: 'var(--surface-2)',
      color: 'var(--muted)',
      border: '1px solid var(--border)',
    };
  };

  // Helper for toxicity warning level
  const getToxicityBadgeStyle = (score: number) => {
    if (score > 0.08) {
      return 'bg-red-500/10 text-red-600 border border-red-500/20';
    }
    if (score > 0.04) {
      return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
    }
    return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
  };

  // Flattened groups for unified heatmap viewing
  const heatmapRows = useMemo(() => {
    if (!results) return [];
    
    const rows: Array<{
      attribute: string;
      group: string;
      sentiment: number;
      toxicity: number;
      responses: string[];
    }> = [];

    Object.entries(results.stereotype_amplification).forEach(([attrName, attrData]) => {
      Object.entries(attrData.group_outputs).forEach(([groupName, groupData]) => {
        rows.push({
          attribute: attrName,
          group: groupName,
          sentiment: groupData.mean_sentiment,
          toxicity: groupData.mean_toxicity,
          responses: groupData.responses,
        });
      });
    });

    return rows;
  }, [results]);

  return (
    <>
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'LLM & RAG Audit' }]} />

      <div className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-8 animate-fade-in pb-24">
        {/* Intro / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Generative AI Bias Observability
            </h1>
            <p className="text-sm text-muted max-w-2xl">
              Audit Large Language Models and Retrieval-Augmented Generation (RAG) pipelines for stereotype amplification, sentiment skew, and contextual retrieval bias.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary flex items-center gap-2 self-start md:self-auto text-xs px-4 py-2 border border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 shadow-sm rounded-xl font-medium"
            onClick={handlePrepopulateMocks}
          >
            <Sparkles size={14} className="text-primary animate-pulse" />
            Use Simulation Mock Endpoints
          </button>
        </div>

        {error && (
          <div className="card border-l-4 border-l-danger bg-danger-dim/35 shadow-md p-4 rounded-xl transition-all duration-300 animate-slide-down">
            <div className="text-sm flex items-start gap-3 text-fg">
              <AlertTriangle className="text-danger shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <span className="font-bold text-danger">Audit Execution Error</span>
                <p className="text-xs text-muted/90 leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Configurations Dashboard */}
        <div className="card border border-border/50 shadow-xl bg-surface/90 backdrop-blur-md rounded-2xl p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center gap-2 border-b border-border/40 pb-3">
              <Sliders size={16} className="text-primary" />
              <h3 className="text-sm font-bold tracking-wider uppercase text-fg">Configuration Details</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* LLM Endpoint URL */}
              <div className="space-y-1.5">
                <label className="label-text block font-semibold text-xs text-muted-foreground">LLM Endpoint URL</label>
                <div className="relative rounded-xl shadow-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/70"><Brain size={16} /></span>
                  <input
                    type="text"
                    className="input pl-10 pr-4 py-2.5 w-full bg-surface-2/60 border border-border/70 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-xl transition-all duration-200"
                    style={{ paddingLeft: '2.5rem' }}
                    value={llmEndpoint}
                    placeholder="https://your-llm-service.com/v1/chat/completions"
                    onChange={(e) => setLlmEndpoint(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-muted pl-1">
                  Supports Hugging Face, OpenAI-compatible APIs, Groq, Anthropic, or Ollama.
                </p>
              </div>

              {/* LLM API Auth Token / Key */}
              <div className="space-y-1.5">
                <label className="label-text block font-semibold text-xs text-muted-foreground">LLM API Auth Token / Key</label>
                <input
                  type="password"
                  className="input px-4 py-2.5 w-full bg-surface-2/60 border border-border/70 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-xl transition-all duration-200"
                  value={llmApiKey}
                  placeholder="••••••••••••••••"
                  onChange={(e) => setLlmApiKey(e.target.value)}
                />
                <p className="text-[10px] text-muted pl-1">Authentication token passed in authorization headers.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* RAG Retrieval Endpoint */}
              <div className="space-y-1.5">
                <label className="label-text block font-semibold text-xs text-muted-foreground">RAG Retrieval Endpoint (Optional)</label>
                <div className="relative rounded-xl shadow-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/70"><Database size={16} /></span>
                  <input
                    type="text"
                    className="input pl-10 pr-4 py-2.5 w-full bg-surface-2/60 border border-border/70 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-xl transition-all duration-200"
                    style={{ paddingLeft: '2.5rem' }}
                    value={ragEndpoint}
                    placeholder="http://localhost:8000/api/mock-rag"
                    onChange={(e) => setRagEndpoint(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-muted pl-1">If provided, audits similarity disparities of retrieved context documents.</p>
              </div>

              {/* Domain Context Templates */}
              <div className="space-y-1.5">
                <label className="label-text block font-semibold text-xs text-muted-foreground">Domain Context Templates</label>
                <select
                  className="input px-4 py-2.5 w-full bg-surface-2/60 border border-border/70 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/30 rounded-xl transition-all duration-200 cursor-pointer"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="hiring">Hiring / HR Candidate Screener</option>
                  <option value="lending">Lending & Credit Risk Evaluation</option>
                  <option value="healthcare">Healthcare Risk & Treatment Priority</option>
                  <option value="generic">Generic / General Context Probes</option>
                </select>
                <p className="text-[10px] text-muted pl-1">Selects specific prompt templates to probe demographic stereotypes.</p>
              </div>
            </div>
          </div>

          {/* Action Box */}
          <div className="flex flex-col justify-between lg:border-l lg:border-border/30 lg:pl-8 space-y-4">
            <div className="bg-surface-2/60 p-4 rounded-xl border border-border/40 text-[11px] text-muted space-y-2.5">
              <div className="font-bold text-fg flex items-center gap-1.5 border-b border-border/30 pb-1.5 text-xs">
                <Sliders size={13} className="text-primary" /> Active Probes Details
              </div>
              <ul className="space-y-1.5 pl-1">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span><strong>3 Attributes:</strong> Gender, Race, Age</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span><strong>11 Demographics:</strong> Probed comprehensively</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span><strong>Metrics:</strong> Toxicity & Sentiment Disparities</span>
                </li>
              </ul>
            </div>
            
            <button
              type="button"
              className="btn btn-primary w-full py-3.5 flex items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/15 hover:shadow-primary/25 transition-all duration-300"
              disabled={loading}
              onClick={handleRunScan}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-white" />
                  <span>Evaluating Model...</span>
                </>
              ) : (
                <>
                  <MessageSquare size={18} />
                  <span>Run LLM Bias Scan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Presentation */}
        {results && (
          <div className="space-y-8 animate-fade-in">
            {/* Summary Banner */}
            <div className="card bg-gradient-to-r from-surface to-surface-2 border border-border/50 shadow-md p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Audit Result Summary</h3>
                <div className="flex items-center gap-2.5">
                  {Object.values(results.stereotype_amplification).some(a => a.sentiment_flagged || a.toxicity_flagged) || 
                   (results.retrieval_bias && results.retrieval_bias.retrieval_bias_flagged) ? (
                    <>
                      <div className="h-3.5 w-3.5 rounded-full bg-danger animate-pulse border-2 border-surface shadow-sm"></div>
                      <span className="text-xl font-bold text-danger">Bias Detected</span>
                    </>
                  ) : (
                    <>
                      <div className="h-3.5 w-3.5 rounded-full bg-success border-2 border-surface shadow-sm"></div>
                      <span className="text-xl font-bold text-success">Compliant / Passed</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <div className="bg-surface-3/45 border border-border/40 px-4 py-2.5 rounded-xl text-center min-w-[100px]">
                  <span className="text-[10px] text-muted uppercase block font-semibold">Max Sentiment Gap</span>
                  <span className="text-lg font-bold text-fg">
                    {Math.max(...Object.values(results.stereotype_amplification).map(a => a.sentiment_disparity)).toFixed(2)}
                  </span>
                </div>
                <div className="bg-surface-3/45 border border-border/40 px-4 py-2.5 rounded-xl text-center min-w-[100px]">
                  <span className="text-[10px] text-muted uppercase block font-semibold">Max Toxicity Gap</span>
                  <span className="text-lg font-bold text-fg">
                    {Math.max(...Object.values(results.stereotype_amplification).map(a => a.toxicity_disparity)).toFixed(3)}
                  </span>
                </div>
                {results.retrieval_bias && typeof results.retrieval_bias.similarity_disparity === 'number' && (
                  <div className="bg-surface-3/45 border border-border/40 px-4 py-2.5 rounded-xl text-center min-w-[100px]">
                    <span className="text-[10px] text-muted uppercase block font-semibold">RAG Retrieval Gap</span>
                    <span className="text-lg font-bold text-fg">
                      {results.retrieval_bias.similarity_disparity.toFixed(3)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stereotype amplification Card */}
            <div className="card border border-border/40 shadow-xl bg-surface rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-fg">Stereotype Amplification Analysis</h2>
                  <p className="text-xs text-muted">Comparison of model responses across demographic attributes to audit skew & prejudice.</p>
                </div>
                <div className="flex gap-4 text-xs font-semibold self-start sm:self-auto">
                  <span className="flex items-center gap-1.5 text-success">
                    <span className="w-2.5 h-2.5 rounded-full bg-success"></span> Positive Sentiment
                  </span>
                  <span className="flex items-center gap-1.5 text-danger">
                    <span className="w-2.5 h-2.5 rounded-full bg-danger"></span> Negative Sentiment
                  </span>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {Object.entries(results.stereotype_amplification).map(([attrName, attrData]) => {
                  const hasDisparity = attrData.sentiment_flagged || attrData.toxicity_flagged;
                  return (
                    <div
                      key={attrName}
                      className="border border-border/50 rounded-xl p-5 bg-surface-2/45 space-y-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                      style={{ borderColor: hasDisparity ? 'rgba(239, 68, 68, 0.2)' : 'var(--border)' }}
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-sm capitalize text-fg flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-primary"></span>
                            {attrName} Attribute
                          </h3>
                          {hasDisparity ? (
                            <span className="text-[9px] px-2 py-0.5 font-bold rounded-full bg-danger-dim text-danger border border-danger/20 shadow-sm animate-pulse">
                              FLAGGED
                            </span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 font-bold rounded-full bg-success-dim text-success border border-success/20 shadow-sm">
                              PASSED
                            </span>
                          )}
                        </div>

                        {/* Attribute metrics summary */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-surface p-3 rounded-xl border border-border/30">
                          <div className="space-y-0.5">
                            <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Sentiment Gap</span>
                            <span className={`text-base font-extrabold ${attrData.sentiment_flagged ? 'text-danger' : 'text-fg'}`}>
                              {attrData.sentiment_disparity.toFixed(2)}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-muted block text-[10px] uppercase font-bold tracking-wider">Toxicity Gap</span>
                            <span className={`text-base font-extrabold ${attrData.toxicity_flagged ? 'text-danger' : 'text-fg'}`}>
                              {attrData.toxicity_disparity.toFixed(3)}
                            </span>
                          </div>
                        </div>

                        {/* Heatmap Column items */}
                        <div className="space-y-2.5">
                          {Object.entries(attrData.group_outputs).map(([groupName, groupData]) => {
                            const isExpanded = expandedGroup === `${attrName}_${groupName}`;
                            const sentimentStyle = getSentimentStyle(groupData.mean_sentiment);
                            return (
                              <div key={groupName} className="space-y-1">
                                <div
                                  style={sentimentStyle}
                                  className="p-3 rounded-xl flex items-center justify-between transition-all duration-200 hover:scale-[1.01] cursor-pointer shadow-sm"
                                  onClick={() => setExpandedGroup(isExpanded ? null : `${attrName}_${groupName}`)}
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs font-bold capitalize truncate block">{groupName}</span>
                                    <span className="text-[10px] opacity-90 block">Sentiment: {groupData.mean_sentiment.toFixed(2)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${getToxicityBadgeStyle(groupData.mean_toxicity)}`}>
                                      Tox: {groupData.mean_toxicity.toFixed(3)}
                                    </span>
                                    {isExpanded ? <ChevronUp size={14} className="opacity-85" /> : <ChevronDown size={14} className="opacity-85" />}
                                  </div>
                                </div>

                                {/* Expandable Model Response Details */}
                                {isExpanded && (
                                  <div className="bg-surface border border-border/45 rounded-xl p-3.5 text-xs space-y-3.5 animate-slide-down shadow-md">
                                    <div className="font-bold text-primary flex items-center gap-1.5 border-b border-border/30 pb-1.5">
                                      <MessageSquare size={13} />
                                      <span>Sample LLM Output Probes</span>
                                    </div>
                                    <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                                      {groupData.responses.map((resp, idx) => (
                                        <div key={idx} className="bg-surface-2/70 p-3 rounded-lg border border-border/30 space-y-1">
                                          <div className="text-[9px] text-muted font-semibold uppercase tracking-wider">
                                            Probe Template {idx + 1} Result
                                          </div>
                                          <div className="text-xs leading-relaxed text-fg space-y-1.5 pt-1">
                                            {renderMarkdown(resp)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Retrieval Bias Analysis */}
            {results.retrieval_bias && 
             results.retrieval_bias.retrieved_doc_samples && 
             results.retrieval_bias.retrieval_similarity_by_group &&
             Object.keys(results.retrieval_bias.retrieved_doc_samples).length > 0 && (
              <div className="card border border-border/40 shadow-xl bg-surface rounded-2xl p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/30 pb-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-fg">RAG Retrieval Bias Audit</h2>
                    <p className="text-xs text-muted">Analysis of similarity and semantic quality disparities in retrieved context chunks.</p>
                  </div>
                  {results.retrieval_bias.retrieval_bias_flagged ? (
                    <span className="text-xs px-3.5 py-1.5 font-bold rounded-full bg-danger-dim text-danger border border-danger/20 flex items-center gap-1.5 shadow-sm">
                      <AlertTriangle size={14} className="animate-pulse" /> BIAS FLAGGED
                    </span>
                  ) : (
                    <span className="text-xs px-3.5 py-1.5 font-bold rounded-full bg-success-dim text-success border border-success/20 flex items-center gap-1.5 shadow-sm">
                      <CheckCircle size={14} /> SYSTEM PASSED
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left stats card */}
                  <div className="space-y-6 lg:col-span-1 flex flex-col justify-between">
                    <div className="bg-surface-2 p-5 rounded-2xl border border-border/40 space-y-3 shadow-inner">
                      <div>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Retrieval Similarity Disparity</span>
                        <div className={`text-3xl font-black mt-1 ${results.retrieval_bias.retrieval_bias_flagged ? 'text-danger' : 'text-fg'}`}>
                          {results.retrieval_bias.similarity_disparity.toFixed(3)}
                        </div>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        Measures the absolute difference in cosine similarity between the queries and retrieved documents across demographics. Disparities &gt; 0.150 suggest systemic retrieval bias.
                      </p>
                    </div>

                    {/* Chart list */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Query Similarity by Demographic</h4>
                      <div className="space-y-3.5">
                        {Object.entries(results.retrieval_bias.retrieval_similarity_by_group).map(([group, score]) => {
                          if (score === null) return null;
                          const pct = Math.round(score * 100);
                          const isLow = score < 0.65;
                          return (
                            <div key={group} className="space-y-1 text-xs">
                              <div className="flex justify-between font-semibold">
                                <span className="capitalize text-fg">{group} query</span>
                                <span className={isLow ? 'text-danger' : 'text-fg'}>{score.toFixed(3)}</span>
                              </div>
                              <div className="w-full bg-surface-2 h-2.5 rounded-full overflow-hidden border border-border/30">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background: isLow ? 'var(--danger)' : 'var(--primary)',
                                  }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Sample Docs Card */}
                  <div className="lg:col-span-2 space-y-4">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Retrieved Context Snippets</h4>
                    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                      {Object.entries(results.retrieval_bias.retrieved_doc_samples).map(([group, docs]) => (
                        <div key={group} className="border border-border/40 rounded-xl p-4 bg-surface-2/45 shadow-sm space-y-3">
                          <div className="flex items-center gap-2 border-b border-border/20 pb-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/30"></span>
                            <span className="text-xs font-bold uppercase tracking-wider text-fg capitalize">{group} Demographic Context</span>
                          </div>
                          <div className="space-y-2.5">
                            {docs.map((doc, idx) => (
                              <div key={idx} className="bg-surface p-3.5 rounded-xl border border-border/30 text-[11px] leading-relaxed text-muted relative group shadow-sm">
                                <span className="absolute top-2 right-3 text-[9px] text-muted/60 font-semibold uppercase">Snippet {idx + 1}</span>
                                <p className="pr-12 italic font-mono text-fg leading-relaxed">"{doc}"</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
