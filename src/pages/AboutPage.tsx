import { ExternalLink, Info, ShieldCheck } from 'lucide-react'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { Card } from '../components/ui'
import { HYDRODASH_LOGO_SVG_HEIGHT, HYDRODASH_LOGO_SVG_WIDTH } from '../lib/hydroDashLogo'
import styles from './AboutPage.module.css'

export function AboutPage() {
  return (
    <MoreSubpageLayout title="About" subtitle="A modern web dashboard for OpenSprinkler controllers.">
      <Card>
        <div className={styles.brand}>
          <span className={styles.logoWrap}>
            <img
              src="/hydroDashLogo.svg"
              alt=""
              className={styles.logo}
              width={HYDRODASH_LOGO_SVG_WIDTH}
              height={HYDRODASH_LOGO_SVG_HEIGHT}
            />
          </span>
          <div>
            <h2 className={styles.brandName}>HydroDash</h2>
            <p className={styles.brandTag}>Web control for OpenSprinkler</p>
          </div>
        </div>
        <p className={styles.p}>
          HydroDash is a web control surface for OpenSprinkler hardware, proxied through a small server so your device
          password stays off the browser.
        </p>
      </Card>

      <div className={styles.grid}>
        <Card title="OpenSprinkler" icon={<Info size={18} aria-hidden />}>
          <p className={styles.p}>
            OpenSprinkler firmware and the original mobile app are developed by the OpenSprinkler project.
          </p>
          <a href="https://opensprinkler.com/" target="_blank" rel="noreferrer" className={styles.link}>
            opensprinkler.com
            <ExternalLink size={14} aria-hidden />
          </a>
        </Card>
        <Card title="Feature parity" icon={<ShieldCheck size={18} aria-hidden />}>
          <p className={styles.p}>
            This UI is an alternative front-end; feature parity with the official app is a goal, not a guarantee. Use
            Settings for power-user options and the official app for anything not covered here.
          </p>
        </Card>
      </div>
    </MoreSubpageLayout>
  )
}
