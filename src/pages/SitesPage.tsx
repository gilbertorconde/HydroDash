import { useAuthSession, useSwitchSite } from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import shell from '../components/MoreSubpageLayout.module.css'
import { Card, Button, ErrorBox, Spinner } from '../components/ui'
import styles from './SitesPage.module.css'

export function SitesPage() {
  const auth = useAuthSession()
  const switchSite = useSwitchSite()

  const sites = auth.data?.sites ?? []
  const active = auth.data?.activeSiteId

  if (auth.isLoading) {
    return (
      <MoreSubpageLayout title="Controllers">
        <Spinner />
      </MoreSubpageLayout>
    )
  }

  return (
    <MoreSubpageLayout title="Controllers">
      <p className={shell.lead}>
        When the server sets the <code>OS_SITES</code> environment variable to a JSON array of{' '}
        <code>{`{ "id", "baseUrl", "label?", "password?" }`}</code>, you can switch which OpenSprinkler
        device HydroDash proxies after login. Otherwise the app uses a single{' '}
        <code>OS_BASE_URL</code> as today.
      </p>

      {sites.length === 0 ? (
        <Card title="Single-controller mode">
          <p className={styles.hint}>
            No multi-site configuration detected. Set <code>OS_SITES</code> on the HydroDash server and
            restart to enable switching. Each site can override <code>password</code>; otherwise{' '}
            <code>OS_PASSWORD</code> / <code>OS_PW_HASH</code> is used for all entries.
          </p>
        </Card>
      ) : (
        <Card title="Saved controllers">
          <ul className={styles.list}>
            {sites.map((s) => {
              const isActive = s.id === active
              return (
                <li key={s.id} className={styles.row}>
                  <div>
                    <p className={styles.siteLabel}>{s.label}</p>
                    <p className={styles.siteId}>
                      <code>{s.id}</code>
                      {isActive ? <span className={styles.badge}>Active</span> : null}
                    </p>
                  </div>
                  <Button
                    variant={isActive ? 'ghost' : 'secondary'}
                    disabled={isActive || switchSite.isPending}
                    onClick={() => switchSite.mutate(s.id)}
                  >
                    {isActive ? 'Selected' : 'Use this controller'}
                  </Button>
                </li>
              )
            })}
          </ul>
          {switchSite.isError ? (
            <ErrorBox message={switchSite.error instanceof Error ? switchSite.error.message : 'Switch failed'} />
          ) : null}
        </Card>
      )}
    </MoreSubpageLayout>
  )
}
