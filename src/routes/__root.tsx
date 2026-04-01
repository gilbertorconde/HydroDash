import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Navigate,
  Outlet,
  Scripts,
  ClientOnly,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ThemeProvider } from '../context/ThemeContext'
import appCss from '../index.css?url'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'HydroDash' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/hydroDashLogo.svg' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: () => <Navigate to="/" replace />,
})

function RootComponent() {
  return (
    <ClientOnly fallback={<div />}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Outlet />
          <TanStackRouterDevtools position="bottom-right" />
        </ThemeProvider>
      </QueryClientProvider>
    </ClientOnly>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
