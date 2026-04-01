import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { SitesPage } from '../pages/SitesPage'

export const Route = createFileRoute('/sites')({
  component: SitesRoute,
})

function SitesRoute() {
  return (
    <ProtectedPage>
      <SitesPage />
    </ProtectedPage>
  )
}
