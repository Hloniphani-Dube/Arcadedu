import {
  Anchor,
  Atom,
  Bird,
  BookText,
  Compass,
  Cpu,
  Dna,
  Map,
  Rocket,
  Shield,
  Sigma,
  Sparkles,
  Telescope,
  Triangle,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

/*
  One place for the app's iconography. We render Lucide icons, not emoji, so
  glyphs stay crisp, themeable and consistent across platforms.
*/

// --- subject glyphs ----------------------------------------------------------

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  algebra: Sigma,
  geometry: Triangle,
  physics: Atom,
  computing: Cpu,
  biology: Dna,
  english: BookText,
}

export function SubjectIcon({
  id,
  className = 'h-5 w-5',
}: {
  id: string
  className?: string
}) {
  const Icon = SUBJECT_ICONS[id] ?? Compass
  return <Icon className={className} />
}

// --- avatars ---------------------------------------------------------------

/** Selectable avatar icons, keyed by the string stored as `profile.avatar`
 *  in the form `icon:<key>`. */
export const AVATAR_ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  map: Map,
  anchor: Anchor,
  bird: Bird,
  shield: Shield,
  telescope: Telescope,
  rocket: Rocket,
  sparkles: Sparkles,
}

export const DEFAULT_AVATAR = 'icon:compass'

/** Old emoji avatars mapped to their nearest icon, so existing profiles
 *  render as icons without a migration. */
const LEGACY_EMOJI: Record<string, string> = {
  '🧑‍🎓': 'compass',
  '🧭': 'compass',
  '🗺️': 'map',
  '⚓': 'anchor',
  '🦉': 'bird',
  '🐉': 'shield',
  '🛡️': 'shield',
  '🔭': 'telescope',
}

/**
 * Renders a profile avatar. `value` is either an uploaded image
 * (`data:` / `http` URL), an icon key (`icon:compass`), or a legacy emoji.
 * `className` fully controls the box (size, rounding, border).
 */
export function Avatar({
  value,
  className = '',
}: {
  value?: string | null
  className?: string
}) {
  const box = `grid place-items-center overflow-hidden bg-panel-2 ${className}`

  if (value && (value.startsWith('data:') || value.startsWith('http'))) {
    return (
      <span className={box}>
        <img src={value} alt="Profile" className="h-full w-full object-cover" />
      </span>
    )
  }

  let iconKey: string | undefined
  if (value?.startsWith('icon:')) iconKey = value.slice(5)
  else if (value && LEGACY_EMOJI[value]) iconKey = LEGACY_EMOJI[value]

  const Icon = (iconKey && AVATAR_ICONS[iconKey]) || UserRound
  return (
    <span className={box}>
      <Icon className="h-[55%] w-[55%] text-mana-bright" />
    </span>
  )
}
