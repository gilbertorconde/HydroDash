import { CheckCircle2, Router } from 'lucide-react'
import { useAuthSession, useSwitchSite } from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { AdvancedSection, Button, Card, EmptyState, ErrorBox, ListGroup, ListRow, Pill, Spinner } from '../components/ui'
import styles from './SitesPage.module.css'

export function SitesPage() {
  const auth = useAuthSession()
  const switchSite = useSwitchSite()

  const sites = auth.data?.sites ?? []
  const active = auth.data?.activeSiteId
  const activeSite = sites.find((s) => s.id === active)

  if (auth.isLoading) {
    return (
      <MoreSubpageLayout title="Controllers">
        <Card>
          <div className={styles.loading}>
            <Spinner />
          </div>
        </Card>
      </MoreSubpageLayout>
    )
  }

  return (
    <MoreSubpageLayout
      title="Controllers"
      subtitle={
        sites.length > 0
          ? `Choose which OpenSprinkler HydroDash controls${activeSite ? ` · now: ${activeSite.label}` : ''}.`
          : 'HydroDash is connected to a single OpenSprinkler controller.'
      }
    >
      {sites.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Router size={22} aria-hidden />}
            title="Single-controller mode"
            description="This server is set up for one controller. Your administrator can add more controllers on the HydroDash server to switch between them here."
          />
        </Card>
      ) : (
        <>
          <ListGroup>
            {sites.map((s) => {
              const isActive = s.id === active
              return (
                <ListRow
                  key={s.id}
                  icon={isActive ? <CheckCircle2 size={19} aria-hidden /> : <Router size={19} aria-hidden />}
                  iconTone={isActive ? 'success' : 'accent'}
                  title={s.label}
                  description={<code className={styles.siteId}>{s.id}</code>}
                  trailing={
                    isActive ? (
                      <Pill tone="success">Active</Pill>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className={styles.useBtn}
                        disabled={switchSite.isPending}
                        onClick={() => switchSite.mutate(s.id)}
                      >
                        Use this controller
                      </Button>
                    )
                  }
                />
              )
            })}
          </ListGroup>
          {switchSite.isError ? (
            <ErrorBox message={switchSite.error instanceof Error ? switchSite.error.message : 'Switch failed'} />
          ) : null}
        </>
      )}

      <AdvancedSection id="sites.setup" title="Server setup" description="How multi-controller mode is configured">
        <p className={styles.hint}>
          When the server sets the <code>OS_SITES</code> environment variable to a JSON array of{' '}
          <code>{`{ "id", "baseUrl", "label?", "password?" }`}</code>, you can switch which OpenSprinkler device
          HydroDash proxies after login. Otherwise the app uses a single <code>OS_BASE_URL</code>.
        </p>
        <p className={styles.hint}>
          Set <code>OS_SITES</code> on the HydroDash server and restart to enable switching. Each site can override{' '}
          <code>password</code>; otherwise <code>OS_PASSWORD</code> / <code>OS_PW_HASH</code> is used for all entries.
        </p>
      </AdvancedSection>
    </MoreSubpageLayout>
  )
}
