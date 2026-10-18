import { Fragment, type ReactNode } from 'react'
import { toast } from 'sonner'

// Inline citation tokens emitted by the agent, e.g. [kyc:db:<uuid>] or [aml:graph:pattern].
const CITATION_RE = /\[([a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)?)\]/g

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Bare UUIDs fall back to their kind (`kyc:db`); named ids show as-is (`cycle_detection`). */
function citationLabel(citationId: string): string {
  const parts = citationId.split(':')
  const last = parts[parts.length - 1] || citationId
  if (parts.length > 1 && UUID_RE.test(last)) return parts.slice(0, -1).join(':')
  return last
}

interface CitationBadgeProps {
  citationId: string
}

/** Minimal inline marker for a grounded evidence reference. Click to copy. */
export function CitationBadge({ citationId }: CitationBadgeProps) {
  const name = citationLabel(citationId)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(citationId)
        toast.success('Citation copied')
      }}
      className="mx-0.5 inline-block max-w-[160px] truncate rounded border border-border/60 bg-muted px-1 align-baseline font-mono text-[10px] text-muted-fg transition-colors hover:text-fg"
      title={`Source: ${citationId}`}
    >
      {name}
    </button>
  )
}

/**
 * Splits text into plain runs and clickable citation badges.
 * `renderText` styles the plain runs (raw text for prose, styled identifiers inside tables).
 */
export function renderWithCitations(
  text: string,
  renderText: (run: string) => ReactNode = (run) => run,
): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  CITATION_RE.lastIndex = 0

  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`t_${lastIndex}`}>
          {renderText(text.slice(lastIndex, match.index))}
        </Fragment>,
      )
    }
    parts.push(
      <CitationBadge key={`c_${match.index}`} citationId={match[1]} />,
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(
      <Fragment key={`t_${lastIndex}`}>
        {renderText(text.slice(lastIndex))}
      </Fragment>,
    )
  }

  return parts
}

/**
 * Renders a react-markdown child tree (a string, or an array mixing text and inline
 * elements), turning citation tokens into badges wherever plain text appears.
 */
export function renderInlines(
  children: ReactNode,
  renderText?: (run: string) => ReactNode,
): ReactNode {
  if (typeof children === 'string') {
    return renderWithCitations(children, renderText)
  }
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === 'string' ? (
        <Fragment key={index}>
          {renderWithCitations(child, renderText)}
        </Fragment>
      ) : (
        child
      ),
    )
  }
  return children
}
