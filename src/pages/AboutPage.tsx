import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { Card } from '../components/ui'
import { HYDRODASH_LOGO_SVG_HEIGHT, HYDRODASH_LOGO_SVG_WIDTH } from '../lib/hydroDashLogo'
import styles from './AboutPage.module.css'

export function AboutPage() {
  return (
    <MoreSubpageLayout
      title={
        <>
          <img
            src="/hydroDashLogo.svg"
            alt=""
            className={styles.titleLogo}
            width={HYDRODASH_LOGO_SVG_WIDTH}
            height={HYDRODASH_LOGO_SVG_HEIGHT}
          />
          About
        </>
      }
      titleClassName={styles.titleRow}
    >
      <Card title="HydroDash">
        <p className={styles.p}>
          HydroDash is a web control surface for OpenSprinkler hardware, proxied through a small server
          so your device password stays off the browser.
        </p>
        <p className={styles.p}>
          OpenSprinkler firmware and the original mobile app are developed by the OpenSprinkler project.{' '}
          <a href="https://opensprinkler.com/" target="_blank" rel="noreferrer">
            opensprinkler.com
          </a>
        </p>
        <p className={styles.p}>
          This UI is an alternative front-end; feature parity with the official app is a goal, not a
          guarantee. Use Settings for power-user options and the official app for anything not covered
          here.
        </p>
      </Card>
    </MoreSubpageLayout>
  )
}
