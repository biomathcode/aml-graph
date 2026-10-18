import { scan } from 'react-scan'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  scan({
    enabled: true,
    log: true,
  })
}
const router = getRouter()
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
