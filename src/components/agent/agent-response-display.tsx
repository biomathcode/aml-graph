import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderInlines } from './citation-badge'
import { markdownTableComponents } from './response-table'

interface AgentResponseDisplayProps {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, any>
    result?: any
    status: string
    durationMs?: number
  }>
}

export function AgentResponseDisplay({ content }: AgentResponseDisplayProps) {
  return (
    <div className="text-xs leading-relaxed text-fg/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...markdownTableComponents,
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 border-b border-border/60 pb-1.5 text-sm font-semibold text-fg first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-sm font-semibold text-fg first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-3 text-xs font-semibold text-fg first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2">{renderInlines(children)}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-4 marker:text-muted-fg">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-4 marker:text-muted-fg">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{renderInlines(children)}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-fg">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) =>
            className?.includes('language-') ? (
              <code>{children}</code>
            ) : (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-fg">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] text-fg">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-border/60" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
