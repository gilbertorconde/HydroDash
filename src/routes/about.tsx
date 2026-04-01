import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { AboutPage } from '../pages/AboutPage'

export const Route = createFileRoute('/about')({
  component: AboutRoute,
})

function AboutRoute() {
  return (
    <ProtectedPage>
      <AboutPage />
    </ProtectedPage>
  )
}
