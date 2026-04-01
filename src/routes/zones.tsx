import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { StationsPage } from '../pages/StationsPage'

export const Route = createFileRoute('/zones')({
  component: ZonesRoute,
})

function ZonesRoute() {
  return (
    <ProtectedPage>
      <StationsPage />
    </ProtectedPage>
  )
}
