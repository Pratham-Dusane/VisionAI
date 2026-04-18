import { Audit, AuditResults, IntersectionalResult, ProxyWarning, RegulationFinding } from './types';

export const MOCK_AUDITS: Audit[] = [
  {
    id: 'aud-001',
    orgId: 'org-1',
    name: 'Q1 Hiring Pipeline Audit',
    domain: 'Hiring / Recruitment',
    status: 'COMPLETE',
    createdAt: new Date('2026-03-15'),
    completedAt: new Date('2026-03-15'),
    fairnessScore: 42,
    config: { labelCol: 'hired', positiveLabel: '1', protectedCols: ['gender', 'race'], fairnessThreshold: 0.8 },
    progressSteps: {},
  },
  {
    id: 'aud-002',
    orgId: 'org-1',
    name: 'Lending Model v3.2',
    domain: 'Financial Lending',
    status: 'COMPLETE',
    createdAt: new Date('2026-03-20'),
    completedAt: new Date('2026-03-20'),
    fairnessScore: 78,
    config: { labelCol: 'approved', positiveLabel: '1', protectedCols: ['race', 'age_group'], fairnessThreshold: 0.8 },
    progressSteps: {},
  },
  {
    id: 'aud-003',
    orgId: 'org-1',
    name: 'Insurance Risk Scoring',
    domain: 'Insurance Underwriting',
    status: 'PROCESSING',
    createdAt: new Date('2026-04-10'),
    fairnessScore: undefined,
    config: { labelCol: 'risk_level', positiveLabel: 'low', protectedCols: ['gender', 'age_group', 'ethnicity'], fairnessThreshold: 0.8 },
    progressSteps: {
      schema_parsing: 'complete', proxy_detection: 'complete', data_profiling: 'complete',
      data_bias_scan: 'running', model_evaluation: 'pending', explainability: 'pending',
      intersectional_audit: 'pending', counterfactual_analysis: 'pending',
      regulation_mapping: 'pending', narrative_generation: 'pending',
    },
  },
  {
    id: 'aud-004',
    orgId: 'org-1',
    name: 'Medical Triage Algorithm',
    domain: 'Healthcare / Medical Triage',
    status: 'COMPLETE',
    createdAt: new Date('2026-04-02'),
    completedAt: new Date('2026-04-02'),
    fairnessScore: 91,
    config: { labelCol: 'priority', positiveLabel: 'high', protectedCols: ['race', 'gender'], fairnessThreshold: 0.8 },
    progressSteps: {},
  },
  {
    id: 'aud-005',
    orgId: 'org-1',
    name: 'University Admissions 2026',
    domain: 'Education / Admissions',
    status: 'COMPLETE',
    createdAt: new Date('2026-04-05'),
    completedAt: new Date('2026-04-05'),
    fairnessScore: 55,
    config: { labelCol: 'admitted', positiveLabel: '1', protectedCols: ['gender', 'socioeconomic'], fairnessThreshold: 0.8 },
    progressSteps: {},
  },
  {
    id: 'aud-006',
    orgId: 'org-1',
    name: 'Recidivism Prediction Model',
    domain: 'Criminal Justice / Risk Assessment',
    status: 'FAILED',
    createdAt: new Date('2026-04-08'),
    fairnessScore: undefined,
    config: { labelCol: 'reoffend', positiveLabel: '1', protectedCols: ['race', 'gender', 'age_group'], fairnessThreshold: 0.8 },
    progressSteps: {},
  },
];

export const MOCK_RESULTS: AuditResults = {
  fairnessScore: 42,
  letterGrade: 'D',
  dataBias: {
    gender: {
      attribute: 'gender',
      privilegedGroup: 'Male',
      metrics: {
        disparateImpact: 0.71,
        statisticalParityDifference: -0.21,
        positiveRatePrivileged: 0.72,
        positiveRateUnprivileged: 0.51,
      },
      verdict: 'FAIL',
      severity: 'HIGH',
      explanation: 'Female applicants receive positive outcomes at 51% vs 72% for males. DI of 0.71 is below the legal threshold of 0.80.',
    },
    race: {
      attribute: 'race',
      privilegedGroup: 'White',
      metrics: {
        disparateImpact: 0.58,
        statisticalParityDifference: -0.30,
        positiveRatePrivileged: 0.74,
        positiveRateUnprivileged: 0.43,
      },
      verdict: 'FAIL',
      severity: 'CRITICAL',
      explanation: 'Non-white applicants receive positive outcomes at 43% vs 74% for white applicants. DI of 0.58 is severely below the legal threshold.',
    },
  },
  modelBias: {
    flipRates: {
      gender: {
        flipRates: { 'Male -> Female': 0.18, 'Female -> Male': 0.22 },
        maxFlipRate: 0.22,
        meanFlipRate: 0.20,
        verdict: 'FAIL',
      },
      race: {
        flipRates: { 'White -> Black': 0.31, 'Black -> White': 0.27, 'White -> Hispanic': 0.14, 'Hispanic -> White': 0.12 },
        maxFlipRate: 0.31,
        meanFlipRate: 0.21,
        verdict: 'FAIL',
      },
    },
    equalizedOdds: {
      gender: {
        Male: { fpr: 0.08, fnr: 0.12, precision: 0.84 },
        Female: { fpr: 0.15, fnr: 0.28, precision: 0.69 },
      },
      race: {
        White: { fpr: 0.06, fnr: 0.10, precision: 0.88 },
        Black: { fpr: 0.19, fnr: 0.34, precision: 0.61 },
        Hispanic: { fpr: 0.14, fnr: 0.25, precision: 0.71 },
      },
    },
  },
  explainability: {
    shapByGroup: {
      Male: { years_experience: 0.32, education_level: 0.28, interview_score: 0.22, zip_code: 0.05 },
      Female: { years_experience: 0.18, education_level: 0.14, interview_score: 0.38, zip_code: 0.15 },
    },
    disparityFlags: [
      { feature: 'interview_score', disparityRatio: 2.43, groupValues: { Male: 0.22, Female: 0.38 }, explanation: "'interview_score' has 1.7x higher impact on decisions for Female group." },
      { feature: 'zip_code', disparityRatio: 3.0, groupValues: { Male: 0.05, Female: 0.15 }, explanation: "'zip_code' has 3.0x higher impact on decisions for Female group." },
    ],
  },
  intersectional: [
    { group: 'gender=Female x race=Black', colA: 'gender', valA: 'Female', colB: 'race', valB: 'Black', sampleSize: 320, positiveRate: 0.28, diVsOverall: 0.42, severity: 'CRITICAL' },
    { group: 'gender=Female x race=Hispanic', colA: 'gender', valA: 'Female', colB: 'race', valB: 'Hispanic', sampleSize: 410, positiveRate: 0.35, diVsOverall: 0.53, severity: 'CRITICAL' },
    { group: 'gender=Male x race=Black', colA: 'gender', valA: 'Male', colB: 'race', valB: 'Black', sampleSize: 680, positiveRate: 0.52, diVsOverall: 0.78, severity: 'HIGH' },
    { group: 'gender=Male x race=White', colA: 'gender', valA: 'Male', colB: 'race', valB: 'White', sampleSize: 4200, positiveRate: 0.78, diVsOverall: 1.17, severity: 'PASS' },
    { group: 'gender=Female x race=White', colA: 'gender', valA: 'Female', colB: 'race', valB: 'White', sampleSize: 890, positiveRate: 0.61, diVsOverall: 0.91, severity: 'PASS' },
    { group: 'gender=Male x race=Hispanic', colA: 'gender', valA: 'Male', colB: 'race', valB: 'Hispanic', sampleSize: 720, positiveRate: 0.58, diVsOverall: 0.87, severity: 'PASS' },
  ],
  featureLaundering: [
    { protectedAttribute: 'race', reconstructionAccuracy: 0.82, baselineAccuracy: 0.45, liftOverBaseline: 0.67, launderingDetected: true, severity: 'CRITICAL', explanation: "Although 'race' is not in the model's feature set, a classifier can predict it from the remaining features with 82.0% accuracy (vs 45.0% baseline). This means the model implicitly has access to 'race' through correlated features." },
    { protectedAttribute: 'gender', reconstructionAccuracy: 0.61, baselineAccuracy: 0.52, liftOverBaseline: 0.19, launderingDetected: false, severity: 'PASS', explanation: "'gender' does not appear to be reconstructable from the model's features." },
  ],
  flipSensitivity: {
    meanFlipCount: 2.4,
    medianFlipCount: 2,
    mostVulnerableCount: 1842,
    mostVulnerablePercentage: 18.4,
    explanation: '1,842 individuals (18.4% of the dataset) are on the decision boundary - a single feature change flips their outcome.',
  },
  historicalHarm: {
    monthsDeployed: 14,
    totalDecisions: 42000,
    decisionsAffectingGroup: 11760,
    estimatedIndividualsHarmed: 3410,
    protectedAttribute: 'race',
    unprivilegedGroup: 'Non-white',
    headline: 'Over 14 months of deployment, approximately 3,410 Non-white individuals may have received unfavorable decisions due to detected bias in race.',
    disclaimer: 'This is a statistical estimate based on measured bias metrics. Actual impact may vary.',
  },
  regulationMap: [
    { finding: 'disparate_impact_below_0.8', regulation: 'US EEOC Uniform Guidelines', clause: '29 CFR § 1607.4(D) - Four-Fifths Rule', description: 'A selection rate less than 4/5ths (80%) of the highest group rate is evidence of adverse impact.', liability: 'HIGH', requiredAction: 'Demonstrate business necessity or eliminate the adverse impact.' },
    { finding: 'disparate_impact_below_0.8', regulation: 'EU AI Act (2024)', clause: 'Article 10 - Data Governance', description: 'High-risk AI systems must use training data free of errors accounting for characteristics leading to discrimination.', liability: 'HIGH - Up to EUR 30M or 6% of global turnover', requiredAction: 'Document data governance practices and mitigation measures.' },
    { finding: 'feature_laundering_detected', regulation: 'EU AI Act (2024)', clause: 'Article 13 - Transparency', description: 'High-risk AI systems shall allow identification of protected characteristics influencing outcomes.', liability: 'CRITICAL - Intentional obfuscation may constitute fraud', requiredAction: 'Remove all proxy features that reconstruct protected attributes.' },
  ],
  proxyVariables: [
    { proxyColumn: 'zip_code', protectedColumn: 'race', associationScore: 0.72, method: "Cramer's V", riskLevel: 'HIGH', explanation: "'zip_code' has Cramer's V of 0.72 with 'race'. If 'race' is excluded but 'zip_code' is kept, the model may still discriminate via this proxy." },
    { proxyColumn: 'surname', protectedColumn: 'race', associationScore: 0.54, method: "Cramer's V", riskLevel: 'HIGH', explanation: "'surname' has Cramer's V of 0.54 with 'race'." },
    { proxyColumn: 'college_tier', protectedColumn: 'race', associationScore: 0.38, method: "Cramer's V", riskLevel: 'MEDIUM', explanation: "'college_tier' has Cramer's V of 0.38 with 'race'." },
  ],
  blindSpots: [
    { column: 'zip_code', encodes: 'race/socioeconomic status', reason: 'Zip codes in urban areas are heavily correlated with race due to historical redlining.', confidence: 'HIGH' },
    { column: 'first_name', encodes: 'gender/ethnicity', reason: 'First names often encode gender and ethnic background.', confidence: 'MEDIUM' },
  ],
};

export const MOCK_DRIFT_DATA = [
  { date: '2025-12', fairnessScore: 75, diGender: 0.88, diRace: 0.82, batchSize: 3200 },
  { date: '2026-01', fairnessScore: 72, diGender: 0.85, diRace: 0.79, batchSize: 3450 },
  { date: '2026-02', fairnessScore: 68, diGender: 0.82, diRace: 0.74, batchSize: 3100 },
  { date: '2026-03', fairnessScore: 58, diGender: 0.76, diRace: 0.68, batchSize: 3800 },
  { date: '2026-04', fairnessScore: 42, diGender: 0.71, diRace: 0.58, batchSize: 3600 },
];

export const MOCK_NARRATIVES: Record<string, string> = {
  technical: `## Technical Audit Summary\n\n### Disparate Impact Analysis\nThe hiring pipeline exhibits **significant adverse impact** across two protected attributes:\n\n- **Gender (DI = 0.71):** Female applicants have a 51% positive outcome rate vs 72% for males, yielding a DI ratio of 0.71 - below the 0.80 legal threshold (4/5ths rule). SPD = -0.21.\n- **Race (DI = 0.58):** Non-white applicants receive positive outcomes at 43% vs 74% for white applicants. DI = 0.58 - severely below threshold. SPD = -0.30.\n\n### Model Perturbation Testing\nFlip rate analysis reveals the model directly uses protected attributes:\n- Gender flip rate: 22% (Male→Female)\n- Race flip rate: 31% (White→Black)\n\nBoth exceed the 10% acceptable threshold.\n\n### Feature Laundering\n**CRITICAL:** Race can be reconstructed from remaining features with 82% accuracy (baseline: 45%). The exclusion of race from the feature set is ineffective - the model accesses racial information through zip_code and surname proxies.\n\n### SHAP Disparity\ninterview_score has 1.7x higher impact for female applicants, suggesting subjective evaluation introduces gender bias.`,

  executive: `## Executive Summary - Hiring Pipeline Risk Assessment\n\n**Overall Fairness Grade: D (42/100)**\n\n🔴 **Key Finding:** Your hiring AI approves 72% of male applicants but only 51% of female applicants, and 74% of white applicants vs 43% of non-white applicants. This constitutes measurable discrimination.\n\n🟠 **Business Risk:** Over 14 months of deployment, approximately **3,410 non-white individuals** may have received unfavorable hiring decisions due to bias. This represents significant legal exposure under EEOC guidelines and potential class action liability.\n\n🟢 **Recommended Action:** Immediately suspend automated hiring decisions pending remediation. Implement SMOTE rebalancing and remove zip_code/surname from model features. Estimated remediation timeline: 3-4 weeks.`,

  legal: `## Legal Compliance Assessment\n\n### Finding 1: Disparate Impact - Race (DI = 0.58)\n**Applicable Regulation:** US EEOC Uniform Guidelines, 29 CFR § 1607.4(D)\n**Violation:** Selection rate for non-white applicants (43%) is less than four-fifths of the white applicant rate (74%). DI = 0.58.\n**Liability Assessment:** HIGH - Federal employment discrimination claim risk. Pattern suggests systemic adverse impact actionable under Title VII.\n**Required Action:** Employer must demonstrate business necessity defense or eliminate adverse impact through model remediation.\n\n### Finding 2: Feature Laundering - Race\n**Applicable Regulation:** EU AI Act (2024), Article 13\n**Violation:** Protected attribute (race) reconstructable at 82% accuracy from remaining features.\n**Liability Assessment:** CRITICAL - Intentional obfuscation may constitute fraud under Article 5(1)(a).\n**Required Action:** Immediate removal of proxy features. Legal counsel consultation required.`,
};

export function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--grade-a)';
  if (score >= 65) return 'var(--grade-b)';
  if (score >= 50) return 'var(--grade-c)';
  if (score >= 35) return 'var(--grade-d)';
  return 'var(--grade-f)';
}

export function getGradeColor(grade: string): string {
  const map: Record<string, string> = { A: 'var(--grade-a)', B: 'var(--grade-b)', C: 'var(--grade-c)', D: 'var(--grade-d)', F: 'var(--grade-f)' };
  return map[grade] || 'var(--muted)';
}

export function getSeverityColor(severity: string): string {
  const map: Record<string, string> = { CRITICAL: 'var(--severity-critical)', HIGH: 'var(--severity-high)', MEDIUM: 'var(--severity-medium)', LOW: 'var(--severity-low)', PASS: 'var(--severity-pass)' };
  return map[severity] || 'var(--muted)';
}
