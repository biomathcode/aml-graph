import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { authClient } from '~/lib/auth-client'
import '~/styles/app.css'
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async ({ context }) => {
      try {
        const session = await context.queryClient.fetchQuery({
          queryKey: ['auth', 'session'],
          queryFn: async () => {
            const res = await authClient.getSession()
            return res.data ?? null
          },
          staleTime: 30_000, // 30s cache prevents redundant requests on link hovers
        })
        return { userId: session?.user?.id }
      } catch {
        // Graceful fallback to existing cached session on temporary error
        const cached = context.queryClient.getQueryData<{ user?: { id: string } }>(['auth', 'session'])
        return { userId: cached?.user?.id }
      }
    },
    component: () => (
      <>
        <Toaster position="top-right" richColors />
        <Outlet />
      </>
    ),
    notFoundComponent: () => <div className="p-8">Page not found</div>,
  },
)
