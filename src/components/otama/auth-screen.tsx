'use client'

import { useState } from 'react'
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtamaLogo } from '@/components/otama/logo'
import { useUser } from '@/components/otama/providers'

/**
 * Full-screen sign-in / create-account gate. Every account gets a fully
 * private watch history + favorites list — nothing is shared between users.
 */
export function AuthScreen() {
  const { refresh } = useUser()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setError('')

    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setBusy(true)
    try {
      const res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong — try again')
        return
      }
      await refresh()
    } catch {
      setError('Could not reach the server — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <OtamaLogo />
          <p className="mt-2 text-sm text-zinc-400">torrent streaming, everywhere</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Sign in or create account">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => { setMode('signin'); setError('') }}
              className={mode === 'signin' ? 'bg-amber-500 font-semibold text-black hover:bg-amber-500 hover:text-black' : 'text-zinc-300'}
            >
              Sign in
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => { setMode('signup'); setError('') }}
              className={mode === 'signup' ? 'bg-amber-500 font-semibold text-black hover:bg-amber-500 hover:text-black' : 'text-zinc-300'}
            >
              Create account
            </Button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="auth-username" className="mb-1.5 block text-xs font-medium text-zinc-400">Username</label>
              <Input
                id="auth-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-name"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="h-11 border-white/10 bg-white/5"
                required
                minLength={3}
                maxLength={24}
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-zinc-400">Password</label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'at least 6 characters' : 'your password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="h-11 border-white/10 bg-white/5"
                required
                minLength={6}
              />
            </div>
            {mode === 'signup' ? (
              <div>
                <label htmlFor="auth-confirm" className="mb-1.5 block text-xs font-medium text-zinc-400">Confirm password</label>
                <Input
                  id="auth-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="h-11 border-white/10 bg-white/5"
                  required
                  minLength={6}
                />
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={busy || !username.trim() || password.length < 6}
              className="h-11 w-full bg-amber-500 font-semibold text-black hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? (
                'Please wait…'
              ) : mode === 'signup' ? (
                <span className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Create account</span>
              ) : (
                <span className="flex items-center gap-2"><LogIn className="h-4 w-4" /> Sign in</span>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-5 flex items-start justify-center gap-1.5 px-2 text-center text-xs leading-relaxed text-zinc-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Every account has its own private watch history and favorites.
          No one else can see what you watch.
        </p>
      </div>
    </main>
  )
}
