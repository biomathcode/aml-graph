import type { ReactNode } from 'react'
import { renderInlines } from './citation-badge'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMBERISH_RE = /^[-\d,./]+$/

/** Styles a plain text run inside a table cell (identifiers in mono, numbers tabular). */
function renderCellRun(text: string): ReactNode {
  const trimmed = text.trim()
  if (!trimmed) return text

  const start = text.indexOf(trimmed)
  const before = text.slice(0, start)
  const after = text.slice(start + trimmed.length)

  let styled: ReactNode = trimmed
  if (UUID_RE.test(trimmed)) {
    styled = <span className="font-mono text-[11px]">{trimmed}</span>
  } else if (NUMBERISH_RE.test(trimmed) && /\d/.test(trimmed)) {
    styled = <span className="tabular-nums">{trimmed}</span>
  }

  return (
    <>
      {before}
      {styled}
      {after}
    </>
  )
}

/**
 * Overrides for react-markdown that render LLM-emitted `| Field | Value | Source |`
 * tables as contained, scrollable tables. Citation tokens inside cells become
 * clickable badges; identifiers render in mono and numbers in tabular figures.
 */
export const markdownTableComponents = {
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[26rem] border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-muted/40">{children}</thead>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-border/40 last:border-b-0">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-2.5 py-1.5 text-[11px] font-medium text-muted-fg">
      {renderInlines(children)}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="max-w-[28rem] px-2.5 py-1.5 align-top leading-relaxed text-fg/90">
      {renderInlines(children, renderCellRun)}
    </td>
  ),
}
