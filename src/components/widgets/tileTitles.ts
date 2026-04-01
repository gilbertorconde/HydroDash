import type { DashboardTileId } from '../../lib/dashboardTileOrder'

export const DASHBOARD_TILE_TITLES: Record<DashboardTileId, string> = {
  controller: 'Controller',
  live: 'Live status',
  sensors: 'Sensors & weather',
  history: 'Recent irrigation',
  quickrun: 'Quick run',
}
