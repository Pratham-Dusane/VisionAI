const DEFAULT_LOCAL_API_BASE = 'http://localhost:8000';

function normalizeApiBase(rawBase: string): string {
  const trimmed = rawBase.trim().replace(/\/$/, '');

  // Prevent mixed-content in production when a stale http:// API base is configured.
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }

  return trimmed;
}

export function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured && configured.trim()) {
    return normalizeApiBase(configured);
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return DEFAULT_LOCAL_API_BASE;
    }
    return normalizeApiBase(window.location.origin);
  }

  return DEFAULT_LOCAL_API_BASE;
}
