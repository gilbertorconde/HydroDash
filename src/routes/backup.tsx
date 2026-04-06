import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { ConfigBackupPage } from '../pages/ConfigBackupPage'

export const Route = createFileRoute('/backup')({
  component: BackupRoute,
})

function BackupRoute() {
  return (
    <ProtectedPage>
      <ConfigBackupPage />
    </ProtectedPage>
  )
}
