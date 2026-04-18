'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Briefcase, Users, ArrowRight, Eye, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const INDUSTRIES = [
  'Hiring / Recruitment',
  'Financial Lending',
  'Healthcare / Medical Triage',
  'Criminal Justice / Risk Assessment',
  'Insurance Underwriting',
  'Education / Admissions',
  'Other',
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, org, loading, orgLoading, createOrganization } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect checks must run in an effect, not during render.
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && !orgLoading && org) {
      router.replace('/dashboard');
    }
  }, [loading, user, orgLoading, org, router]);

  if ((!loading && !user) || (!loading && !orgLoading && !!org)) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!orgName.trim()) {
      setError('Organization name is required');
      return;
    }
    if (!industry) {
      setError('Please select an industry');
      return;
    }

    setSubmitting(true);
    try {
      await createOrganization(
        orgName.trim(),
        industry,
        teamSize ? parseInt(teamSize) : undefined
      );
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Failed to create organization');
      setSubmitting(false);
    }
  };

  if (loading || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="login-spinner" />
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-card animate-fade-in" style={{ maxWidth: 440 }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-5">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--primary)' }}
          >
            <Eye size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--fg)' }}>
            Set up your organization
          </h1>
          <p className="text-xs mt-1 text-center" style={{ color: 'var(--muted)' }}>
            Welcome, {user?.displayName || user?.email}! Create your workspace to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Org Name */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Organization Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="login-field">
              <Building2 size={15} className="login-field-icon" />
              <input
                type="text"
                placeholder="e.g. Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="login-input"
                id="org-name-input"
                required
              />
            </div>
          </div>

          {/* Industry */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Industry <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="login-field">
              <Briefcase size={15} className="login-field-icon" />
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="login-input login-select"
                id="org-industry-select"
                required
              >
                <option value="" disabled>Select your industry</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Team Size */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Team Size <span className="text-[10px]" style={{ color: 'var(--placeholder)' }}>(optional)</span>
            </label>
            <div className="login-field">
              <Users size={15} className="login-field-icon" />
              <input
                type="number"
                placeholder="Number of team members"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                className="login-input"
                id="org-team-size-input"
                min={1}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error animate-fade-in" id="onboarding-error-msg">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="login-submit-btn mt-1"
            id="create-org-btn"
          >
            <span>{submitting ? 'Creating...' : 'Create Organization'}</span>
            {!submitting && <ArrowRight size={15} />}
            {submitting && <div className="login-spinner-sm" />}
          </button>
        </form>
      </div>
    </div>
  );
}
