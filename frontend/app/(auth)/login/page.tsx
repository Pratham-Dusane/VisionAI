'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const GUIDED_SANDBOX_ARMED_KEY = 'visionai-guided-sandbox-armed';
const GUIDED_SANDBOX_DISABLED_KEY = 'visionai-guided-sandbox-disabled';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle, user, org, loading, orgLoading } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated - use useEffect to avoid setState during render
  useEffect(() => {
    if (!loading && user && !orgLoading) {
      if (org) {
        router.replace('/dashboard');
      } else {
        router.replace('/onboarding');
      }
    }
  }, [loading, user, org, orgLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isRegister) {
        if (!displayName.trim()) {
          setError('Name is required');
          setSubmitting(false);
          return;
        }
        await signUp(email, password, displayName);
        try {
          window.localStorage.setItem(GUIDED_SANDBOX_ARMED_KEY, '1');
          window.localStorage.removeItem(GUIDED_SANDBOX_DISABLED_KEY);
        } catch {
          // Non-blocking localStorage write for guided sandbox kickoff.
        }
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Invalid email or password');
      } else if (code === 'auth/email-already-in-use') {
        setError('Email already registered. Try signing in.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters');
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else {
        setError(err?.message || 'Something went wrong');
      }
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Google sign-in failed');
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="login-spinner" />
      </div>
    );
  }

  return (
    <div className="login-container">
      {/* Animated background orbs (visible in dark mode only via CSS) */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      {/* Card */}
      <div className="login-card animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'var(--primary)' }}
          >
            <Eye size={24} color="#FFFFFF" strokeWidth={2.5} />
          </div>
          <h1 className="page-title tracking-wide">
            <span style={{ color: 'var(--logo-primary)' }}>Vision</span>
            <span style={{ color: 'var(--logo-secondary)' }}>AI</span>
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Fairness Observability Platform
          </p>
        </div>

        {/* Title */}
        <h2 className="text-base font-semibold text-center mb-1" style={{ color: 'var(--fg)' }}>
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-xs text-center mb-5" style={{ color: 'var(--muted)' }}>
          {isRegister ? 'Start auditing AI fairness today' : 'Sign in to continue to your dashboard'}
        </p>

        {/* Google button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={submitting}
          className="google-btn"
          id="google-sign-in-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--placeholder)' }}>
            or continue with email
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <div className="login-field">
              <User size={15} className="login-field-icon" />
              <input
                type="text"
                placeholder="Full name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="login-input"
                id="register-name-input"
                autoComplete="name"
              />
            </div>
          )}

          <div className="login-field">
            <Mail size={15} className="login-field-icon" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              id="email-input"
              required
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <Lock size={15} className="login-field-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              id="password-input"
              required
              minLength={6}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="login-eye-btn"
              tabIndex={-1}
            >
              <Eye size={14} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error animate-fade-in" id="auth-error-msg">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="login-submit-btn"
            id="auth-submit-btn"
          >
            <span>{submitting ? (isRegister ? 'Creating...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}</span>
            {!submitting && <ArrowRight size={15} />}
            {submitting && <div className="login-spinner-sm" />}
          </button>
        </form>

        {/* Toggle */}
        <p className="text-center text-xs mt-4" style={{ color: 'var(--muted)' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="font-semibold transition-colors cursor-pointer"
            style={{ color: 'var(--primary)' }}
            id="auth-toggle-btn"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
