export interface TourStep {
  target: string;       // CSS selector for the element to highlight
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="welcome"]',
    title: 'Welcome to VisionAI!',
    description: 'Let\'s take a quick tour of your fairness dashboard. This will only take 30 seconds.',
    position: 'bottom',
  },
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    description: 'Navigate between Dashboard, Audits, Reports, Drift Monitoring, and Settings.',
    position: 'right',
  },
  {
    target: '[data-tour="new-audit"]',
    title: 'Create a New Audit',
    description: 'Click here to upload a dataset and run your first AI fairness audit.',
    position: 'right',
  },
  {
    target: '[data-tour="fairness-score"]',
    title: 'Fairness Confidence Score',
    description: 'This shows your system\'s overall fairness health across all monitored models.',
    position: 'bottom',
  },
  {
    target: '[data-tour="proxy-alerts"]',
    title: 'Proxy Variable Alerts',
    description: 'Proxy variables are hidden features that may silently encode bias (e.g., ZIP code → race).',
    position: 'bottom',
  },
  {
    target: '[data-tour="audit-timeline"]',
    title: 'Audit Timeline',
    description: 'View all past audits, their compliance status, and severity scores at a glance.',
    position: 'top',
  },
  {
    target: '[data-tour="model-compare"]',
    title: 'Model Comparison',
    description: 'Compare two audit runs side-by-side to track fairness improvements over time.',
    position: 'top',
  },
  {
    target: '[data-tour="done"]',
    title: 'You\'re All Set! 🎉',
    description: 'Click the ? button in the top bar anytime to replay this tour. Happy auditing!',
    position: 'bottom',
  },
];

export default TOUR_STEPS;
