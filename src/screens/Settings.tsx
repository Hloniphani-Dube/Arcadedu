import { Settings as SettingsIcon, ImageIcon } from 'lucide-react'
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
      className={`relative h-6 w-11 flex-shrink-0 border border-edge transition-colors ${
        checked ? 'bg-mana' : 'bg-panel-2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 border border-edge transition-transform ${
          checked ? 'translate-x-[22px] bg-on-accent' : 'translate-x-0.5 bg-panel'
        }`}
      />
    </button>
  )
}

export function Settings() {
  const showRpgHud = useSettings((s) => s.showRpgHud)
  const setShowRpgHud = useSettings((s) => s.setShowRpgHud)

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
            <ImageIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Story Mode portraits</div>
            <div className="text-xs text-muted">
              Show a portrait image for each Story Mode stop.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${showRpgHud ? 'text-mana-bright' : 'text-muted'}`}
            >
              {showRpgHud ? 'On' : 'Off'}
            </span>
            <Switch
              checked={showRpgHud}
              onChange={setShowRpgHud}
              label="Show Story Mode portraits"
            />
          </div>
        </div>
      </Panel>
    </div>
  )
}
