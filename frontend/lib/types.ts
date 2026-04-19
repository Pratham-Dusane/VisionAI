export type AuditStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type StakeholderMode = 'technical' | 'executive' | 'legal';

export interface Audit {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  status: AuditStatus;
  createdAt: Date;
  completedAt?: Date;
  config: AuditConfig;
  progressSteps: Record<string, 'pending' | 'running' | 'complete' | 'failed'>;
  results?: AuditResults;
  narratives?: Record<StakeholderMode, string>;
  fairnessScore?: number;
}

export interface AuditConfig {
  labelCol: string;
  positiveLabel: string;
  protectedCols: string[];
  fairnessThreshold: number;
  deploymentStart?: Date;
  monthlyDecisions?: number;
}

export interface AuditResults {
  fairnessScore: number;
  letterGrade: LetterGrade;
  dataBias: Record<string, DataBiasResult>;
  modelBias?: ModelBiasResult;
  explainability?: ExplainabilityResult;
  intersectional: IntersectionalResult[];
  featureLaundering: LaunderingResult[];
  flipSensitivity?: FlipSensitivityResult;
  historicalHarm?: HistoricalHarmResult;
  regulationMap: RegulationFinding[];
  proxyVariables: ProxyWarning[];
  blindSpots: BlindSpotResult[];
}

export interface DataBiasResult {
  attribute: string;
  privilegedGroup: string;
  metrics: {
    disparateImpact: number;
    statisticalParityDifference: number;
    positiveRatePrivileged: number;
    positiveRateUnprivileged: number;
  };
  verdict: 'PASS' | 'FAIL';
  severity: SeverityLevel;
  explanation: string;
}

export interface ModelBiasResult {
  flipRates: Record<string, {
    flipRates: Record<string, number>;
    maxFlipRate: number;
    meanFlipRate: number;
    verdict: 'PASS' | 'FAIL';
  }>;
  equalizedOdds: Record<string, Record<string, {
    fpr: number;
    fnr: number;
    precision: number;
  }>>;
}

export interface ExplainabilityResult {
  shapByGroup: Record<string, Record<string, number>>;
  disparityFlags: {
    feature: string;
    disparityRatio: number;
    groupValues: Record<string, number>;
    explanation: string;
  }[];
}

export interface IntersectionalResult {
  group: string;
  colA: string;
  valA: string;
  colB: string;
  valB: string;
  sampleSize: number;
  positiveRate: number;
  diVsOverall: number | null;
  severity: SeverityLevel;
}

export interface LaunderingResult {
  protectedAttribute: string;
  reconstructionAccuracy: number;
  baselineAccuracy: number;
  liftOverBaseline: number;
  launderingDetected: boolean;
  severity: SeverityLevel;
  explanation: string;
}

export interface FlipSensitivityResult {
  meanFlipCount: number;
  medianFlipCount: number;
  mostVulnerableCount: number;
  mostVulnerablePercentage: number;
  explanation: string;
}

export interface HistoricalHarmResult {
  monthsDeployed: number;
  totalDecisions: number;
  decisionsAffectingGroup: number;
  estimatedIndividualsHarmed: number;
  protectedAttribute: string;
  unprivilegedGroup: string;
  headline: string;
  disclaimer: string;
}

export interface RegulationFinding {
  finding: string;
  regulation: string;
  clause: string;
  description: string;
  liability: string;
  requiredAction: string;
}

export interface ProxyWarning {
  proxyColumn: string;
  protectedColumn: string;
  associationScore: number;
  method: string;
  riskLevel: 'HIGH' | 'MEDIUM';
  explanation: string;
}

export interface BlindSpotResult {
  column: string;
  encodes: string;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ColumnSchema {
  name: string;
  dtype: string;
  uniqueCount: number;
  nullCount: number;
  sampleValues: string[];
  sensitivityScore: number;
  flaggedReason: string | null;
  autoFlagged: boolean;
}

export interface DriftMetric {
  protectedAttribute: string;
  diRatio: number | null;
  spd: number | null;
  severity: SeverityLevel;
  equalizedOdds?: {
    fpr_gap: number;
    groups: Record<string, { fpr: number; fnr: number }>;
  };
}

export interface DriftBatch {
  id: string;
  orgId: string;
  auditId?: string | null;
  batchDate: string;
  uploadDate: string;
  notes?: string;
  rowCount: number;
  storagePath: string;
  fairnessScore: number;
  letterGrade: LetterGrade;
  metrics: DriftMetric[];
  worstDi: number;
  alertTriggered: boolean;
  status: 'COMPLETE' | 'FAILED';
}
