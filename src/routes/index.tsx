import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { DashboardPage } from '../pages/DashboardPage'

export const Route = createFileRoute('/')({
  component: HomeRoute,
})

function HomeRoute() {
  return (
    <ProtectedPage>
      <DashboardPage />
    </ProtectedPage>
  )
}
