import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/stations')({
  component: StationsRedirect,
})

function StationsRedirect() {
  return <Navigate to="/zones" replace />
}
