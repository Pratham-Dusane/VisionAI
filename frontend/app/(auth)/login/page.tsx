'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Mail, Lock, User, ArrowRight, AlertCircle, ShieldCheck, ScanLine, Radar, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';

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

  const handleGuestLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signIn('guest@gmail.com', 'guest123');
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        try {
          await signUp('guest@gmail.com', 'guest123', 'Guest');
          if (auth?.currentUser && db) {
            const orgRef = doc(collection(db, 'organizations'));
            await setDoc(orgRef, {
              name: 'GuestOrg',
              industry: 'Technology',
              teamSize: null,
              ownerId: auth.currentUser.uid,
              members: [auth.currentUser.uid],
              createdAt: serverTimestamp(),
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        } catch (signUpErr: any) {
          setError(signUpErr?.message || 'Failed to create guest account');
          setSubmitting(false);
        }
      } else {
        setError(err?.message || 'Guest login failed');
        setSubmitting(false);
      }
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
      <div className="login-grid">
        <section className="login-showcase animate-fade-in" aria-label="VisionAI audit preview">
          <div className="login-brand-row">
            <div className="login-brand-mark">
              <Eye size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div>
              <h1><span>Vision</span>AI</h1>
              <p>Bias intelligence for high-stakes models</p>
            </div>
          </div>

          <div className="login-hero-copy">
            <div className="login-kicker">
              <Sparkles size={14} />
              <span>Judging-ready live audit command center</span>
            </div>
            <h2>See unfair decisions before they reach people.</h2>
            <p>
              Upload a model, trace hidden bias, simulate protected-attribute flips, and ship
              stakeholder-ready reports from one cinematic workspace.
            </p>
          </div>

          <div className="login-orbit-stage" aria-hidden="true">
            <div className="login-scan-card login-scan-card-main">
              <div className="login-scan-header">
                <span>Fairness scan</span>
                <strong>LIVE</strong>
              </div>
              <div className="login-radar">
                <div className="login-radar-sweep" />
                <ShieldCheck size={38} />
              </div>
              <div className="login-metric-row">
                <span>DI ratio</span>
                <strong>0.91</strong>
              </div>
              <div className="login-metric-row danger">
                <span>Intersectional risk</span>
                <strong>High</strong>
              </div>
            </div>

            <div className="login-floating-chip chip-a">
              <ScanLine size={15} />
              Shadow tests passed
            </div>
            <div className="login-floating-chip chip-b">
              <Radar size={15} />
              Causal path detected
            </div>
            <div className="login-neural-line line-a" />
            <div className="login-neural-line line-b" />
          </div>
        </section>

        <section className="login-card animate-fade-in" aria-label={isRegister ? 'Create account' : 'Sign in'}>
          <div className="login-card-topline">
            <span>{isRegister ? 'Create workspace' : 'Secure access'}</span>
            <span>Google Solutions 2026</span>
          </div>

          <h2>{isRegister ? 'Build your audit room' : 'Enter the audit room'}</h2>
          <p className="login-card-subtitle">
            {isRegister ? 'Start with a guided sandbox and demo-ready datasets.' : 'Continue to your VisionAI fairness dashboard.'}
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

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--placeholder)' }}>
            or
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        <button
          onClick={handleGuestLogin}
          type="button"
          disabled={submitting}
          className="login-submit-btn"
          style={{ background: 'var(--surface-2)', color: 'var(--fg)', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)' }}
        >
          <span>Guest Login - Solutions Challenge Exclusive</span>
        </button>

        <p className="login-toggle-copy">
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
        </section>
      </div>
    </div>
  );
}
