import { enemyArtFor } from '../game/enemyArt'
import { useSettings } from '../settings/settings-store'
import type { EnemyTier } from '../lib/types'

export function EnemyPortrait({
  tier,
  seed,
  className = '',
}: {
  tier: EnemyTier
  seed: string
  className?: string
}) {
  const show = useSettings((s) => s.showRpgHud)
  if (!show) return null

  return (
    <img
      src={enemyArtFor(tier, seed)}
      alt=""
      className={`arcade-frame border border-edge bg-panel-2 object-contain ${className}`}
    />
  )
}
