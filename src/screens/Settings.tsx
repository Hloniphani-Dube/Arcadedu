import { Settings as SettingsIcon, Swords } from 'lucide-react'
import { PageHeader, Panel, SectionTitle } from '../components/ui'
import { SkinMenu } from '../components/ui/skin-menu'
import { ColorThemeMenu } from '../components/ui/color-theme-menu'
import { useSettings } from '../settings/settings-store'

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`arcade-frame relative h-6 w-11 flex-shrink-0 border border-edge transition-colors ${
        checked ? 'bg-mana' : 'bg-panel-2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 border border-edge bg-panel transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function Settings() {
  const showEnemyArt = useSettings((s) => s.showEnemyArt)
  const setShowEnemyArt = useSettings((s) => s.setShowEnemyArt)

  return (
    <div>
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title="Settings" />

      <SectionTitle>Appearance</SectionTitle>
      <Panel className="mb-6 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="flex-1">
          <div className="mb-1 text-sm font-semibold">Skin</div>
          <SkinMenu />
        </div>
        <div className="flex-1">
          <div className="mb-1 text-sm font-semibold">Color theme</div>
          <ColorThemeMenu />
        </div>
      </Panel>

      <SectionTitle>Gameplay</SectionTitle>
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center border border-edge bg-panel-2 text-mana-bright">
            <Swords className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Enemy characters</div>
            <div className="text-xs text-muted">
              Show pixel-art enemy portraits during battles.
            </div>
          </div>
          <Switch
            checked={showEnemyArt}
            onChange={setShowEnemyArt}
            label="Show enemy characters"
          />
        </div>
      </Panel>
    </div>
  )
}
