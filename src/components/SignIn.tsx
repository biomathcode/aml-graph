import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { authClient } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/field'
import { Container } from '~/components/ui/container'

export function SignIn() {
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {}
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      errors.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.'
    }

    if (mode === 'password' && !password) {
      errors.password = 'Password is required.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const formatAuthError = (err: { code?: string; message?: string } | unknown): string => {
    if (!err || typeof err !== 'object') {
      return 'An unexpected error occurred during sign in. Please try again.'
    }

    const errObj = err as { code?: string; message?: string }
    const code = (errObj.code || '').toUpperCase()
    const msg = (errObj.message || '').toLowerCase()

    if (
      code === 'INVALID_EMAIL_OR_PASSWORD' ||
      code === 'INVALID_CREDENTIALS' ||
      msg.includes('invalid') ||
      msg.includes('credentials') ||
      msg.includes('password')
    ) {
      return 'Invalid email or password. Please verify your credentials and try again.'
    }

    if (code === 'USER_NOT_FOUND' || msg.includes('user not found') || msg.includes('no user')) {
      return 'No account was found with this email. Please check your email or sign up.'
    }

    if (code === 'TOO_MANY_REQUESTS' || msg.includes('too many') || msg.includes('rate limit')) {
      return 'Too many sign-in attempts. Please wait a moment before trying again.'
    }

    if (msg.includes('email not verified')) {
      return 'Your email address is not verified. Please verify your email before signing in.'
    }

    return errObj.message || 'Sign in failed. Please check your credentials and try again.'
  }

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!validate()) return

    setBusy(true)

    try {
      if (mode === 'password') {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        })

        if (result.error) {
          const formatted = formatAuthError(result.error)
          setErrorMessage(formatted)
          toast.error(formatted)
          return
        }

        // Invalidate and pre-populate session cache
        await queryClient.invalidateQueries({ queryKey: ['auth'] })
        toast.success('Signed in successfully.')
        window.location.assign('/dashboard')
      } else {
        // Magic link mode
        const result = await authClient.signIn.magicLink({
          email: email.trim(),
          callbackURL: '/dashboard',
        })

        if (result.error) {
          const formatted = formatAuthError(result.error)
          setErrorMessage(formatted)
          toast.error(formatted)
          return
        }

        const msg = 'A sign-in link has been sent to your email. Check your inbox to proceed.'
        setSuccessMessage(msg)
        toast.success(msg)
      }
    } catch (err: unknown) {
      const formatted = formatAuthError(err)
      setErrorMessage(formatted)
      toast.error(formatted)
    } finally {
      setBusy(false)
    }
  }

  const handlePasswordReset = async () => {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldErrors({ email: 'Please enter a valid email address to request a password reset.' })
      toast.error('Please enter a valid email address.')
      return
    }

    setBusy(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const result = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (result.error) {
        const formatted = formatAuthError(result.error)
        setErrorMessage(formatted)
        toast.error(formatted)
        return
      }

      const msg = 'Password reset instructions have been sent to your email.'
      setSuccessMessage(msg)
      toast.success(msg)
    } catch (err: unknown) {
      const formatted = formatAuthError(err)
      setErrorMessage(formatted)
      toast.error(formatted)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="w-full min-h-[calc(100vh-4rem)] flex justify-center items-center py-12 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="size-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">OpenKYC</h1>
          <p className="text-xs text-muted-fg max-w-xs">
            Open-source identity verification, biometric AML, and compliance platform.
          </p>
        </div>

        <Card className="border-border/70 shadow-sm backdrop-blur-xs">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Sign in</CardTitle>
              {/* Mode switch pills */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 text-xs border border-border/50">
                <button
                  type="button"
                  onClick={() => {
                    setMode('password')
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                    mode === 'password'
                      ? 'bg-card text-fg shadow-2xs'
                      : 'text-muted-fg hover:text-fg'
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('magic')
                    setErrorMessage(null)
                    setSuccessMessage(null)
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                    mode === 'magic'
                      ? 'bg-card text-fg shadow-2xs'
                      : 'text-muted-fg hover:text-fg'
                  }`}
                >
                  Magic Link
                </button>
              </div>
            </div>
            <CardDescription className="text-xs text-muted-fg">
              {mode === 'password'
                ? 'Enter your credentials to access your operator dashboard.'
                : 'Receive a passwordless sign-in link delivered straight to your email.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Inline Error Alert */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed animate-in fade-in-50 duration-200"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Inline Success Alert */}
            {successMessage && (
              <div
                role="status"
                className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs leading-relaxed animate-in fade-in-50 duration-200"
              >
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              {/* Email Input */}
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs font-medium text-fg flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted-fg" />
                  Email address
                </Label>
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="operator@openkyc.org"
                  value={email}
                  disabled={busy}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                  className={fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {fieldErrors.email && (
                  <p className="text-[11px] text-destructive font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password Input (only in password mode) */}
              {mode === 'password' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="signin-password"
                      className="text-xs font-medium text-fg flex items-center gap-1.5"
                    >
                      <Lock className="size-3.5 text-muted-fg" />
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={busy}
                      className="text-[11px] font-medium text-primary hover:underline transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={password}
                      disabled={busy}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (fieldErrors.password)
                          setFieldErrors((prev) => ({ ...prev, password: undefined }))
                      }}
                      className={
                        fieldErrors.password
                          ? 'border-destructive focus-visible:ring-destructive pr-10'
                          : 'pr-10'
                      }
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg p-1 rounded-md transition-colors"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-[11px] text-destructive font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                intent="primary"
                className="w-full mt-2 font-medium"
                isDisabled={busy}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {mode === 'password' ? 'Signing in...' : 'Sending link...'}
                  </span>
                ) : mode === 'password' ? (
                  'Sign in'
                ) : (
                  'Send magic link'
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2 border-t border-border/50 text-center">
            <p className="text-xs text-muted-fg">
              Don&apos;t have an account?{' '}
              <Link
                to="/sign-up"
                className="font-semibold text-primary hover:underline transition-colors"
              >
                Create an account
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </Container>
  )
}
