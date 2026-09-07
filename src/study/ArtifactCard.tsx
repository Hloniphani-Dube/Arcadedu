import { useState } from 'react'
import {
  ClipboardCheck,
  Copy,
  FileText,
  Mail,
  ListChecks,
  ScrollText,
} from 'lucide-react'
import type { MissionArtifact } from './types'
import { Panel, Btn, Chip } from '../components/ui'

const ICON = {
  session_items: ListChecks,
  revision_sheet: ScrollText,
  progress_report: FileText,
  message_draft: Mail,
  weekly_brief: FileText,
} as const

/** Renders one thing the agent produced for the student. */
export function ArtifactCard({
  artifact,
  onApprove,
  onArchive,
}: {
  artifact: MissionArtifact
  onApprove?: () => void
  onArchive?: () => void
}) {
  const [open, setOpen] = useState(artifact.kind === 'message_draft')
  const [copied, setCopied] = useState(false)
  const Icon = ICON[artifact.kind] ?? FileText

  const body =
    artifact.content.body ??
    artifact.content.text ??
    (artifact.content.items
      ? `${artifact.content.items.length} practice item${
          artifact.content.items.length === 1 ? '' : 's'
        } ready`
      : '')

  const copyText =
    artifact.kind === 'message_draft'
      ? `${artifact.content.subject ? `Subject: ${artifact.content.subject}\n\n` : ''}${artifact.content.body ?? ''}`
      : (artifact.content.text ?? '')

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const preparing = artifact.status === 'preparing'

  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-mana-bright" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{artifact.title}</span>
            {artifact.status === 'draft' && <Chip tone="xp">Draft</Chip>}
            {preparing && <Chip tone="mana">Preparing…</Chip>}
            {artifact.created_by === 'agent' && !preparing && (
              <Chip tone="mana">by the agent</Chip>
            )}
          </div>

          {!preparing && artifact.kind !== 'session_items' && (
            <>
              {open ? (
                <div className="mt-2">
                  {artifact.content.subject && (
                    <div className="mb-1 text-xs text-muted">
                      Subject: <span className="text-ink">{artifact.content.subject}</span>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink">
                    {body}
                  </pre>
                </div>
              ) : (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{body}</p>
              )}
            </>
          )}
          {artifact.kind === 'session_items' && !preparing && (
            <p className="mt-1 text-sm text-muted">{body} — open the session to start.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {artifact.kind !== 'session_items' && !preparing && (
              <Btn size="sm" onClick={() => setOpen((v) => !v)}>
                {open ? 'Collapse' : 'Open'}
              </Btn>
            )}
            {copyText && (
              <Btn size="sm" onClick={copy}>
                {copied ? (
                  <>
                    <ClipboardCheck className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </Btn>
            )}
            {artifact.status === 'draft' && onApprove && (
              <Btn size="sm" variant="primary" onClick={onApprove}>
                Looks good
              </Btn>
            )}
            {onArchive && (
              <Btn size="sm" variant="link" onClick={onArchive}>
                Dismiss
              </Btn>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
