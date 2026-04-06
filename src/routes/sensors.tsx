import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { AnalogSensorsPage } from '../pages/AnalogSensorsPage'

export const Route = createFileRoute('/sensors')({
  component: SensorsRoute,
})

function SensorsRoute() {
  return (
    <ProtectedPage>
      <AnalogSensorsPage />
    </ProtectedPage>
  )
}
