import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { HistoryPage } from '../pages/HistoryPage'

export const Route = createFileRoute('/history')({
  component: HistoryRoute,
})

function HistoryRoute() {
  return (
    <ProtectedPage>
      <HistoryPage />
    </ProtectedPage>
  )
}
