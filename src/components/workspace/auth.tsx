'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { safeNext } from '@/lib/auth/redirect';
import { Button } from './forms';
import './workspace.css';
export function AuthForm({
  mode,
  next = '/app',
  callbackError = false,
  entry,
}: {
  mode: 'login' | 'signup' | 'forgot' | 'reset';
  next?: string;
  callbackError?: boolean;
  entry?: 'studio' | 'client';
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      callbackError
        ? 'That email link could not be verified. Request a fresh link and try again.'
        : '',
    ),
    [message, setMessage] = useState('');
  const titles = {
    login: 'Welcome back.',
    signup: 'Your projects, moving forward.',
    forgot: 'Let’s get you back in.',
    reset: 'A fresh start.',
  };
  const destination = safeNext(next);
  const invitationEntry = /^\/(?:client|app)\/invite\/[^/?]+(?:\?|$)/.test(destination);
  const clientEntry = entry
    ? entry === 'client'
    : !invitationEntry && destination.startsWith('/client');
  const entryHref = (choice: 'studio' | 'client') =>
    invitationEntry
      ? `/signup?next=${encodeURIComponent(destination)}&entry=${choice}`
      : `/signup?next=/${choice === 'studio' ? 'app' : 'client'}`;
  return (
    <div className="ws-auth">
      <header>
        <Link href="/" className="ws-auth-brand">
          <Layers size={26} />
          Clientlane
        </Link>
      </header>
      <main id="main" className="ws-auth-grid">
        <aside>
          <p className="ws-eyebrow">LESS CHASING. MORE CREATING.</p>
          <h2>
            Good work deserves
            <br />a clear path.
          </h2>
          <p>One calm place for client inputs, feedback, and the next step.</p>
          <div className="ws-auth-quote">
            <span>01</span>
            <strong>Collect what you need.</strong>
            <span>02</span>
            <strong>Share work with confidence.</strong>
            <span>03</span>
            <strong>Agree on what comes next.</strong>
          </div>
        </aside>
        <section className="ws-auth-card">
          <p className="ws-eyebrow">
            {mode === 'signup'
              ? invitationEntry && !entry
                ? 'CREATE AN ACCOUNT TO ACCEPT'
                : clientEntry
                  ? 'CREATE YOUR CLIENT ACCOUNT'
                  : 'CREATE YOUR WORKSPACE'
              : invitationEntry
                ? 'YOUR PROJECT INVITATION AWAITS'
                : clientEntry
                  ? 'YOUR CLIENT PROJECTS AWAIT'
                  : 'YOUR STUDIO AWAITS'}
          </p>
          <h1>{titles[mode]}</h1>
          <p className="ws-muted">
            {mode === 'signup'
              ? invitationEntry && !entry
                ? 'Choose how you work, then create your account to review this invitation.'
                : clientEntry
                  ? 'Client accounts are free. Bring your existing provider or accept a project invitation.'
                  : 'Start with an empty workspace. No payment details needed.'
              : mode === 'forgot'
                ? 'We’ll email a secure password recovery link.'
                : mode === 'reset'
                  ? 'Choose a password with at least 10 characters.'
                  : 'Sign in to pick up where you left off.'}
          </p>
          {mode === 'signup' && (
            <nav className="ws-auth-links" aria-label="Choose account entry">
              <Link href={entryHref('studio')}>I’m a freelancer or agency</Link>
              <Link href={entryHref('client')}>I’m a client</Link>
            </nav>
          )}
          <form
            method="post"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setMessage('');
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const email = String(f.get('email') ?? ''),
                password = String(f.get('password') ?? '');
              try {
                const auth = createBrowserSupabase().auth;
                if ((mode === 'signup' || mode === 'reset') && password !== f.get('confirm'))
                  throw new Error('The passwords don’t match. Please check both fields.');
                if (mode === 'login') {
                  const r = await auth.signInWithPassword({ email, password });
                  if (r.error) throw r.error;
                  window.location.assign(safeNext(next));
                } else if (mode === 'signup') {
                  const r = await auth.signUp({
                    email,
                    password,
                    options: {
                      emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
                    },
                  });
                  if (r.error) throw r.error;
                  if (r.data.session) window.location.assign(safeNext(next));
                  else setMessage('Check your email to confirm your account, then sign in.');
                } else if (mode === 'forgot') {
                  const r = await auth.resetPasswordForEmail(email, {
                    redirectTo: `${location.origin}/auth/callback?next=/reset`,
                  });
                  if (r.error) throw r.error;
                  setMessage('If an account exists for this email, a recovery link is on its way.');
                } else {
                  const r = await auth.updateUser({ password });
                  if (r.error) throw r.error;
                  window.location.assign('/app');
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to continue. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode !== 'reset' && (
              <label className="ws-field">
                <span>Email address</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
            )}
            {mode !== 'forgot' && (
              <label className="ws-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  minLength={mode === 'login' ? undefined : 10}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </label>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <label className="ws-field">
                <span>Confirm password</span>
                <input
                  name="confirm"
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            {error && (
              <p role="alert" className="ws-error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="ws-success">
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send recovery link'
                      : 'Save password'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="ws-auth-links">
            {mode === 'login' ? (
              <>
                <Link href="/forgot-password">Forgot password?</Link>
                <Link href={`/signup?next=${encodeURIComponent(safeNext(next))}`}>
                  Create an account
                </Link>
              </>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(safeNext(next))}`}>
                Back to sign in
              </Link>
            )}
          </div>
          <p className="ws-muted">
            {mode === 'login' && (
              <>
                <Link href="/login?next=/client">Sign in to client projects</Link>
                <br />
              </>
            )}
            Explore first? <Link href="/demo">Try the interactive demo</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
