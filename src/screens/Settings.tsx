import { Settings as SettingsIcon } from 'lucide-react'
import { PageHeader, Panel, SectionTitle } from '../components/ui'
import { SkinMenu } from '../components/ui/skin-menu'
import { ColorThemeMenu } from '../components/ui/color-theme-menu'

export function Settings() {
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
    </div>
  )
}
