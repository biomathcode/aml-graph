import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { authClient } from '~/lib/auth-client'
import { Container } from '~/components/ui/container'

export const Route = createFileRoute('/sign-out')({
  component: SignOutPage,
})

function SignOutPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [done, setDone] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function executeSignOut() {
      try {
        await authClient.signOut()
      } catch (err) {
        console.warn('Sign out call error:', err)
      } finally {
        // Clear all active cached queries so session is completely flushed
        queryClient.clear()
        if (isMounted) {
          setDone(true)
          toast.success('Signed out successfully.')
          void navigate({ to: '/sign-in' })
        }
      }
    }

    void executeSignOut()

    return () => {
      isMounted = false
    }
  }, [navigate, queryClient])

  return (
    <Container className="w-full min-h-[calc(100vh-4rem)] flex justify-center items-center py-12 px-4">
      <div className="flex flex-col items-center text-center space-y-4 max-w-sm">
        <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
          <ShieldCheck className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-fg">Signing Out</h1>
          <p className="text-xs text-muted-fg">
            {done ? 'Session closed. Redirecting to sign in...' : 'Securing session and clearing active workspace...'}
          </p>
        </div>
        <Loader2 className="size-5 text-primary animate-spin" />
      </div>
    </Container>
  )
}
