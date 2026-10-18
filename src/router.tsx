import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
  })
  return routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: 'intent',
      scrollRestoration: true,
      context: { queryClient },
      defaultErrorComponent: ({ error, reset }) => (
        <div className="p-8 space-y-4">
          <h1>Unable to load this page</h1>
          <p>{error instanceof Error ? error.message : 'Request failed'}</p>
          <button onClick={reset}>Try again</button>
        </div>
      ),
    }),
    queryClient,
  )
}
