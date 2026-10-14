import { createFileRoute } from '@tanstack/react-router'
import { ProtectedPage } from '../components/ProtectedPage'
import { SettingsPage } from '../pages/SettingsPage'
import { isSettingsSectionId, type SettingsSectionId } from '../pages/settings/sectionMeta'

type SettingsSearch = {
  /** Open section (`/settings?section=network`); absent = landing list. */
  section?: SettingsSectionId
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section: isSettingsSectionId(search.section) ? search.section : undefined,
  }),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { section } = Route.useSearch()
  return (
    <ProtectedPage>
      <SettingsPage section={section} />
    </ProtectedPage>
  )
}
