import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/tools')({
  component: ToolsRedirect,
})

function ToolsRedirect() {
  return <Navigate to="/more" replace />
}
