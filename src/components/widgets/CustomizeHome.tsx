import { ChevronDown, ChevronUp } from 'lucide-react'
import { AdvancedSection, Button, Switch } from '../ui'
import {
  HOME_CARD_TITLES,
  moveHomeCard,
  resetHomeCards,
  setHomeCardVisible,
  type HomeCardId,
  type HomeCardVisibility,
} from '../../lib/homeDashboardLayout'
import styles from './dashboardWidgets.module.css'

type Props = {
  order: HomeCardId[]
  visibility: HomeCardVisibility
}

/** Advanced: show/hide and reorder Home cards (persisted in localStorage, part of app backup). */
export function CustomizeHome({ order, visibility }: Props) {
  return (
    <AdvancedSection
      id="home-customize"
      title="Customize Home"
      description="Show, hide and reorder the cards on this page"
    >
      <ul className={styles.customList}>
        {order.map((id, i) => (
          <li key={id} className={styles.customRow}>
            <div className={styles.customSwitch}>
              <Switch
                checked={visibility[id]}
                onChange={(v) => setHomeCardVisible(visibility, id, v)}
                label={HOME_CARD_TITLES[id]}
              />
            </div>
            <span className={styles.customMove}>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={i === 0}
                aria-label={`Move ${HOME_CARD_TITLES[id]} up`}
                onClick={() => moveHomeCard(order, id, -1)}
              >
                <ChevronUp size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={i === order.length - 1}
                aria-label={`Move ${HOME_CARD_TITLES[id]} down`}
                onClick={() => moveHomeCard(order, id, 1)}
              >
                <ChevronDown size={18} aria-hidden />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.customActions}>
        <Button variant="secondary" size="sm" onClick={() => resetHomeCards()}>
          Reset to defaults
        </Button>
      </div>
    </AdvancedSection>
  )
}
