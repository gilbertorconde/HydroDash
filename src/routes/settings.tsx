import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { SettingsPage } from '../pages/SettingsPage'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return (
    <ProtectedPage>
      <SettingsPage />
    </ProtectedPage>
  )
}
