import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuthSession } from '../api/hooks'
import { Spinner } from './ui'
import { AppLayout } from './AppLayout'

export function ProtectedPage({ children }: { children: ReactNode }) {
  const auth = useAuthSession()

  if (auth.isLoading) {
    return <Spinner />
  }

  if (!auth.data?.authenticated) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout>{children}</AppLayout>
}
