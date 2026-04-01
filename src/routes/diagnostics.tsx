import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { DiagnosticsPage } from '../pages/DiagnosticsPage'

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsRoute,
})

function DiagnosticsRoute() {
  return (
    <ProtectedPage>
      <DiagnosticsPage />
    </ProtectedPage>
  )
}
