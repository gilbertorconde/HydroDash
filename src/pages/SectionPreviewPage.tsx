import { Card } from '../components/ui'
import styles from './SectionPreviewPage.module.css'

export function SectionPreviewPage({
  title,
  subtitle,
  blocks,
}: {
  title: string
  subtitle: string
  blocks: Array<{ name: string; items: string[] }>
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.badge}>Phase 2 layout preview</span>
      </div>
      <p className={styles.subtitle}>{subtitle}</p>
      <p className={styles.note}>
        This is a UX structure mock. Feature behavior will be added in the next
        implementation phase.
      </p>
      <div className={styles.grid}>
        {blocks.map((b) => (
          <Card key={b.name} title={b.name}>
            <ul className={styles.list}>
              {b.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}
