import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { SchedulePreviewPage } from '../pages/SchedulePreviewPage'

export const Route = createFileRoute('/preview')({
  component: PreviewRoute,
})

function PreviewRoute() {
  return (
    <ProtectedPage>
      <SchedulePreviewPage />
    </ProtectedPage>
  )
}
