import { useState, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
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
import { authClient } from '~/lib/auth-client'
import { Container } from '~/components/ui/container'

export default function SignUp() {
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string
    lastName?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})

  const imageRef = useRef<File | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be under 5MB.')
        return
      }
      imageRef.current = file
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const validate = (): boolean => {
    const errors: {
      firstName?: string
      lastName?: string
      email?: string
      password?: string
      confirmPassword?: string
    } = {}

    if (!firstName.trim()) {
      errors.firstName = 'First name is required.'
    }

    if (!lastName.trim()) {
      errors.lastName = 'Last name is required.'
    }

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      errors.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!password) {
      errors.password = 'Password is required.'
    } else if (password.length < 12) {
      errors.password = 'Password must be at least 12 characters long.'
    }

    if (!passwordConfirmation) {
      errors.confirmPassword = 'Please confirm your password.'
    } else if (password !== passwordConfirmation) {
      errors.confirmPassword = 'Passwords do not match.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const formatSignUpError = (err: { code?: string; message?: string } | unknown): string => {
    if (!err || typeof err !== 'object') {
      return 'An unexpected error occurred during account creation. Please try again.'
    }

    const errObj = err as { code?: string; message?: string }
    const code = (errObj.code || '').toUpperCase()
    const msg = (errObj.message || '').toLowerCase()

    if (
      code === 'USER_ALREADY_EXISTS' ||
      msg.includes('already exists') ||
      msg.includes('duplicate') ||
      msg.includes('registered')
    ) {
      return 'An account with this email address already exists. Please sign in instead.'
    }

    if (code === 'PASSWORD_TOO_SHORT' || msg.includes('at least 12') || msg.includes('short')) {
      return 'Password must be at least 12 characters long.'
    }

    if (code === 'TOO_MANY_REQUESTS' || msg.includes('too many') || msg.includes('rate limit')) {
      return 'Too many sign-up attempts. Please wait a moment before trying again.'
    }

    return errObj.message || 'Failed to create account. Please check your information and try again.'
  }

  const handleSignUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMessage(null)

    if (!validate()) return

    setLoading(true)

    try {
      const base64Image = imageRef.current ? await convertImageToBase64(imageRef.current) : ''

      const result = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: `${firstName.trim()} ${lastName.trim()}`,
        image: base64Image,
      })

      if (result.error) {
        const formatted = formatSignUpError(result.error)
        setErrorMessage(formatted)
        toast.error(formatted)
        setLoading(false)
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast.success('Account created successfully! Redirecting...')
      window.location.assign('/dashboard')
    } catch (err: unknown) {
      const formatted = formatSignUpError(err)
      setErrorMessage(formatted)
      toast.error(formatted)
      setLoading(false)
    }
  }

  return (
    <Container className="w-full min-h-[calc(100vh-4rem)] flex justify-center items-center py-12 px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="size-11 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Create an OpenKYC Account</h1>
          <p className="text-xs text-muted-fg max-w-sm">
            Set up your operator credentials for biometric identity verification & compliance monitoring.
          </p>
        </div>

        <Card className="border-border/70 shadow-sm backdrop-blur-xs">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold">Sign Up</CardTitle>
            <CardDescription className="text-xs text-muted-fg">
              Enter your professional details to establish your compliance workspace.
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

            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Name fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first-name" className="text-xs font-medium text-fg flex items-center gap-1.5">
                    <User className="size-3.5 text-muted-fg" />
                    First name
                  </Label>
                  <Input
                    id="first-name"
                    placeholder="Jane"
                    value={firstName}
                    disabled={loading}
                    onChange={(e) => {
                      setFirstName(e.target.value)
                      if (fieldErrors.firstName)
                        setFieldErrors((prev) => ({ ...prev, firstName: undefined }))
                    }}
                    className={fieldErrors.firstName ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {fieldErrors.firstName && (
                    <p className="text-[11px] text-destructive font-medium mt-1">
                      {fieldErrors.firstName}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="last-name" className="text-xs font-medium text-fg">
                    Last name
                  </Label>
                  <Input
                    id="last-name"
                    placeholder="Doe"
                    value={lastName}
                    disabled={loading}
                    onChange={(e) => {
                      setLastName(e.target.value)
                      if (fieldErrors.lastName)
                        setFieldErrors((prev) => ({ ...prev, lastName: undefined }))
                    }}
                    className={fieldErrors.lastName ? 'border-destructive focus-visible:ring-destructive' : ''}
                  />
                  {fieldErrors.lastName && (
                    <p className="text-[11px] text-destructive font-medium mt-1">
                      {fieldErrors.lastName}
                    </p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-fg flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted-fg" />
                  Work email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="jane.doe@organization.com"
                  value={email}
                  disabled={loading}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (fieldErrors.email)
                      setFieldErrors((prev) => ({ ...prev, email: undefined }))
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

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-fg flex items-center gap-1.5">
                    <Lock className="size-3.5 text-muted-fg" />
                    Password
                  </Label>
                  <span className="text-[11px] text-muted-fg">Min 12 characters</span>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={password}
                    disabled={loading}
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

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="password_confirmation"
                  className="text-xs font-medium text-fg flex items-center gap-1.5"
                >
                  <Lock className="size-3.5 text-muted-fg" />
                  Confirm password
                </Label>
                <div className="relative">
                  <Input
                    id="password_confirmation"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={passwordConfirmation}
                    disabled={loading}
                    onChange={(e) => {
                      setPasswordConfirmation(e.target.value)
                      if (fieldErrors.confirmPassword)
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                    }}
                    className={
                      fieldErrors.confirmPassword
                        ? 'border-destructive focus-visible:ring-destructive pr-10'
                        : 'pr-10'
                    }
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg p-1 rounded-md transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] text-destructive font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    {fieldErrors.confirmPassword}
                  </p>
                )}
                {password && passwordConfirmation && password === passwordConfirmation && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                    <CheckCircle2 className="size-3" />
                    Passwords match
                  </p>
                )}
              </div>

              {/* Profile Image (Optional) */}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="profile-image" className="text-xs font-medium text-fg flex items-center gap-1.5">
                  <ImageIcon className="size-3.5 text-muted-fg" />
                  Profile photo <span className="text-muted-fg font-normal">(optional)</span>
                </Label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <div className="relative size-12 rounded-lg border border-border/80 overflow-hidden shrink-0 shadow-2xs group">
                      <img
                        src={imagePreview}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          imageRef.current = null
                          setImagePreview(null)
                        }}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="size-12 rounded-lg border border-dashed border-border/80 bg-muted/30 flex items-center justify-center shrink-0 text-muted-fg">
                      <User className="size-5" />
                    </div>
                  )}

                  <Input
                    id="profile-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={loading}
                    className="text-xs file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                intent="primary"
                className="w-full mt-4 font-medium"
                isDisabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2 border-t border-border/50 text-center">
            <p className="text-xs text-muted-fg">
              Already have an account?{' '}
              <Link
                to="/sign-in"
                className="font-semibold text-primary hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </Container>
  )
}

async function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
