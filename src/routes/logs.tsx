import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/logs')({
  component: LogsRedirect,
})

function LogsRedirect() {
  return <Navigate to="/history" replace />
}
