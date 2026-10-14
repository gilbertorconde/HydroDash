import type { HomeTileId } from '../../lib/homeDashboardLayout'

export const DASHBOARD_TILE_TITLES: Record<HomeTileId, string> = {
  running: 'Now running',
  controller: 'Controller',
  live: 'Live status',
  sensors: 'Sensors & weather',
  history: 'Recent irrigation',
  quickrun: 'Quick run',
}
