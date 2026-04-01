import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { ProgramsPage } from '../pages/ProgramsPage'

export const Route = createFileRoute('/programs')({
  component: ProgramsRoute,
})

function ProgramsRoute() {
  return (
    <ProtectedPage>
      <ProgramsPage />
    </ProtectedPage>
  )
}
