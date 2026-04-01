import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { ForecastPage } from '../pages/ForecastPage'

export const Route = createFileRoute('/forecast')({
  component: ForecastRoute,
})

function ForecastRoute() {
  return (
    <ProtectedPage>
      <ForecastPage />
    </ProtectedPage>
  )
}
