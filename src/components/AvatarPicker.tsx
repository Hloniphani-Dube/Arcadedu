import { useRef, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { Btn } from './ui'
import { AVATAR_ICONS, DEFAULT_AVATAR } from './icons'
import { fileToAvatarDataUrl } from '../lib/image'

export function AvatarPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (avatar: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const hasPhoto = value.startsWith('data:') || value.startsWith('http')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploadError(null)
    try {
      onChange(await fileToAvatarDataUrl(file))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(AVATAR_ICONS).map(([key, Icon]) => {
          const iconValue = `icon:${key}`
          const active = value === iconValue
          return (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => onChange(iconValue)}
              className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                active
                  ? 'border-mana bg-mana/15 text-mana-bright'
                  : 'border-edge text-muted hover:border-mana hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
        <Btn onClick={() => fileRef.current?.click()} className="ml-1">
          <span className="flex items-center gap-1.5">
            <Upload className="h-4 w-4 opacity-70" />
            {hasPhoto ? 'Change photo' : 'Upload photo'}
          </span>
        </Btn>
        {hasPhoto && (
          <Btn variant="danger" onClick={() => onChange(DEFAULT_AVATAR)}>
            <span className="flex items-center gap-1.5">
              <Trash2 className="h-4 w-4" /> Remove
            </span>
          </Btn>
        )}
      </div>
      {uploadError && <p className="mt-2 text-xs text-hp">{uploadError}</p>}
    </div>
  )
}
