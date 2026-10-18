import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Send,
  Paperclip,
  X,
  Plus,
  Trash2,
  Copy,
  Download,
  ChevronRight,
  Loader2,
  Square,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { AgentResponseDisplay } from '~/components/agent/agent-response-display'

export const Route = createFileRoute('/_app/agent')({
  component: AgenticChatPage,
})

interface ToolCallItem {
  id: string
  name: string
  arguments: Record<string, any>
  result?: any
  status: 'running' | 'completed' | 'failed'
  durationMs?: number
  startedAt?: number
}

interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls?: ToolCallItem[]
  imageUrl?: string
  timestamp: number
  statusStage?: 'routing' | 'tools' | 'thinking' | 'generating' | 'done'
  statusMessage?: string
}

function formatToolTitle(name: string): string {
  switch (name) {
    case 'get_entity_dossier':
      return 'Dossier lookup'
    case 'analyze_employee_compliance':
      return 'Employee compliance audit'
    case 'run_aml_algorithms':
      return 'AML algorithms'
    case 'run_graph_cypher':
      return 'Cypher query'
    case 'search_entities':
      return 'Entity search'
    case 'inspect_document_vision':
      return 'Document vision'
    default:
      return name.replace(/_/g, ' ')
  }
}

interface InvestigationThread {
  id: string
  title: string
  category: 'all' | 'customer' | 'employee' | 'graph'
  createdAt: number
  messages: ChatMessageItem[]
}

const PRESET_SUGGESTIONS = [
  {
    label: 'Elena Rostova — customer KYC',
    query:
      'Perform a comprehensive KYC and AML graph analysis on customer Elena Rostova. Check for circular fund movements, account ownership, and sanctions exposure.',
  },
  {
    label: 'Marcus Vance — employee audit',
    query:
      'Run an internal compliance audit on employee Marcus Vance (Senior Compliance Officer). Check for conflict-of-interest, manual alert overrides, and shared identifiers with flagged customers.',
  },
  {
    label: 'Cycle detection',
    query:
      'Run the FalkorDB Cycle Detection algorithm to discover any circular money laundering loops (3-5 hops) across accounts and determine fund preservation rates.',
  },
  {
    label: 'Smurfing & structuring',
    query:
      'Execute the Smurfing Detection algorithm to detect fan-in structured deposits under the $10,000 reporting threshold and identify high-risk destination accounts.',
  },
  {
    label: 'Entity resolution',
    query:
      'Run Entity Resolution on the graph to identify duplicate entities or synthetic identity rings sharing tax IDs, phone numbers, device fingerprints, or IP subnets.',
  },
  {
    label: 'Passport document vision',
    query:
      'Inspect submitted passport documents for Elena Rostova using Nemotron vision analysis. Verify MRZ checksums, microprint integrity, and match against graph identity attributes.',
  },
  {
    label: 'DPRK IT-worker screening',
    query:
      'Screen all employees, contractors and customer account holders for North Korean IT-worker indicators using the DPRK exposure screening algorithm. Detect operatives of the North Korean remote-worker scheme working for the DPRK government: falsified identities and third-party identity reuse, shared device/IP laptop-farm infrastructure, sessions from the DPRK-allocated 175.45.176.0/24 IP range, payments in USDT/crypto, accounts in proxy jurisdictions (PRK/CHN/RUS/LA), and remittances to OFAC-designated DPRK front companies (Korea Osong Shipping Co, Chonsurim Trading Corporation). Flag anyone who may be working for the North Korean government with indicator evidence, cite UNSCR 2397 obligations, and recommend containment actions.',
  },
]

const INITIAL_THREAD: InvestigationThread = {
  id: 'thread_default',
  title: 'AML & compliance',
  category: 'all',
  createdAt: Date.now(),
  messages: [
    {
      id: 'msg_welcome',
      role: 'assistant',
      content: `Ask about a customer, employee, or transaction pattern.

I can search verification records, run FalkorDB graph algorithms and Cypher queries, and inspect submitted documents.`,
      timestamp: Date.now(),
    },
  ],
}

function ToolFindingsView({ tc }: { tc: ToolCallItem }) {
  const { name, result } = tc
  if (!result) return null

  if (name === 'analyze_employee_compliance' && result.employee) {
    const emp = result.employee
    const audit = result.conflictOfInterestAudit || {}
    return (
      <div className="space-y-1.5">
        <p className="text-fg">
          {[emp.role, emp.department, emp.clearanceLevel]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {audit.internalInvestigationRecommended && (
          <p className="text-danger">
            {audit.summary || 'Conflict of interest — investigation recommended.'}
          </p>
        )}
        {(emp.complianceFlags || []).length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-muted-fg">
            {emp.complianceFlags.map((flag: string, i: number) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (name === 'get_entity_dossier' && result.name) {
    const level = String(result.riskLevel || 'clean')
    return (
      <div className="space-y-1.5">
        <p className="text-fg">
          {result.name}
          {result.attributes?.nationality
            ? ` · ${result.attributes.nationality}`
            : ''}
          {' · '}
          <span
            className={
              level === 'critical' || level === 'high'
                ? 'text-danger'
                : 'text-muted-fg'
            }
          >
            Risk {result.riskScore ?? 0}/100 ({level})
          </span>
        </p>
        {result.flagReasons?.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-muted-fg">
            {result.flagReasons.map((reason: string, i: number) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (name === 'run_aml_algorithms') {
    const summaries = Array.isArray(result.chunkSummaries)
      ? result.chunkSummaries
      : []
    return (
      <div className="space-y-1.5">
        <p className="text-fg">
          {result.algorithm || 'Graph algorithm'}
          {typeof result.chunksRetrieved !== 'undefined'
            ? ` · ${result.chunksRetrieved} chunks`
            : ''}
        </p>
        {result.cycles?.[0] && (
          <p className="break-all font-mono text-[11px] text-muted-fg">
            {(result.cycles[0].path || result.cycles[0].accounts || []).join(
              ' → ',
            )}
          </p>
        )}
        {summaries.length > 0 && (
          <ul className="space-y-0.5">
            {summaries.map((chunk: any) => {
              const fired =
                typeof chunk.detected === 'number'
                  ? chunk.detected > 0
                  : chunk.id === 'aml:graph:nk_worker'
              return (
                <li
                  key={chunk.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate font-mono text-[11px] text-muted-fg">
                    {chunk.algorithm || chunk.title}
                  </span>
                  <span className={fired ? 'text-danger' : 'text-muted-fg'}>
                    {typeof chunk.detected !== 'undefined'
                      ? fired
                        ? `${chunk.detected} hit${chunk.detected === 1 ? '' : 's'}`
                        : 'no hits'
                      : fired
                        ? 'flagged'
                        : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <details className="text-muted-fg">
      <summary className="w-fit cursor-pointer list-none hover:text-fg">
        Raw output
      </summary>
      <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-2 font-mono text-[10px] text-fg/80">
        {JSON.stringify(result, null, 2)}
      </pre>
    </details>
  )
}

export default function AgenticChatPage() {
  const [threads, setThreads] = useState<InvestigationThread[]>(() => {
    try {
      const saved = localStorage.getItem('openkyc_agent_threads')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [INITIAL_THREAD]
  })

  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('openkyc_agent_active_thread')
      if (saved) return saved
    } catch {}
    return INITIAL_THREAD.id
  })

  const [inputPrompt, setInputPrompt] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [imageFileName, setImageFileName] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<
    'all' | 'customer' | 'employee' | 'graph'
  >('all')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showHistory, setShowHistory] = useState(true)
  const [toolsExpanded, setToolsExpanded] = useState<Record<string, boolean>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const activeThread = useMemo(() => {
    return (
      threads.find((t) => t.id === activeThreadId) ||
      threads[0] ||
      INITIAL_THREAD
    )
  }, [threads, activeThreadId])

  useEffect(() => {
    try {
      localStorage.setItem('openkyc_agent_threads', JSON.stringify(threads))
      localStorage.setItem('openkyc_agent_active_thread', activeThreadId)
    } catch {}
  }, [threads, activeThreadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeThread.messages, isStreaming])

  const toggleTools = (messageId: string) => {
    setToolsExpanded((prev) => ({ ...prev, [messageId]: !prev[messageId] }))
  }

  const handleCreateNewThread = () => {
    const newThread: InvestigationThread = {
      id: `thread_${Date.now()}`,
      title: 'New case',
      category: activeFilter,
      createdAt: Date.now(),
      messages: [INITIAL_THREAD.messages[0]],
    }
    setThreads((prev) => [newThread, ...prev])
    setActiveThreadId(newThread.id)
    setInputPrompt('')
    setSelectedImage(null)
  }

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (threads.length === 1) {
      setThreads([INITIAL_THREAD])
      setActiveThreadId(INITIAL_THREAD.id)
      return
    }
    const remaining = threads.filter((t) => t.id !== id)
    setThreads(remaining)
    if (activeThreadId === id) {
      setActiveThreadId(remaining[0].id)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Only images are supported')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB')
      return
    }
    setImageFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setSelectedImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    setImageFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (
      customPrompt !== undefined ? customPrompt : inputPrompt
    ).trim()
    if (!textToSend && !selectedImage) return
    if (isStreaming) return

    const userMessageId = `user_${Date.now()}`
    const assistantMessageId = `asst_${Date.now()}`

    const newUserMessage: ChatMessageItem = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      imageUrl: selectedImage || undefined,
      timestamp: Date.now(),
    }

    const initialAssistantMessage: ChatMessageItem = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      reasoning: '',
      toolCalls: [],
      statusStage: 'routing',
      statusMessage: 'Searching records…',
      timestamp: Date.now(),
    }

    const isFirstUserMessage = activeThread.messages.length <= 1
    const newTitle = isFirstUserMessage
      ? textToSend.slice(0, 32) + (textToSend.length > 32 ? '...' : '')
      : activeThread.title

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              title: newTitle,
              messages: [...t.messages, newUserMessage, initialAssistantMessage],
            }
          : t,
      ),
    )

    setInputPrompt('')
    setSelectedImage(null)
    setImageFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''

    setIsStreaming(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    const apiMessages = [...activeThread.messages, newUserMessage]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl,
      }))

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          activeFilter,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Agent service error: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No readable stream received from agent server')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const patchAssistant = (patch: Partial<ChatMessageItem>) => {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeThread.id
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === assistantMessageId ? { ...m, ...patch } : m,
                  ),
                }
              : t,
          ),
        )
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const block of lines) {
          if (!block.trim()) continue
          const eventMatch = block.match(/^event:\s*(\w+)/m)
          const dataMatch = block.match(/^data:\s*(.+)$/m)
          if (!eventMatch || !dataMatch) continue

          const eventName = eventMatch[1]
          let eventData: any = {}
          try {
            eventData = JSON.parse(dataMatch[1])
          } catch {
            eventData = { raw: dataMatch[1] }
          }

          if (eventName === 'status') {
            patchAssistant({
              statusStage: eventData.stage,
              statusMessage: eventData.message,
            })
          } else if (eventName === 'reasoning') {
            setThreads((prev) =>
              prev.map((t) =>
                t.id === activeThread.id
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              statusStage: 'thinking',
                              statusMessage: 'Reasoning…',
                              reasoning: (m.reasoning || '') + (eventData.delta || ''),
                            }
                          : m,
                      ),
                    }
                  : t,
              ),
            )
          } else if (eventName === 'content') {
            setThreads((prev) =>
              prev.map((t) =>
                t.id === activeThread.id
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              statusStage: 'generating',
                              statusMessage: 'Writing…',
                              content: (m.content || '') + (eventData.delta || ''),
                            }
                          : m,
                      ),
                    }
                  : t,
              ),
            )
          } else if (eventName === 'tool_start') {
            const newToolCall: ToolCallItem = {
              id: eventData.id || `tc_${Date.now()}`,
              name: eventData.name,
              arguments: eventData.arguments,
              status: 'running',
              startedAt: Date.now(),
            }
            setThreads((prev) =>
              prev.map((t) =>
                t.id === activeThread.id
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              statusStage: 'tools',
                              statusMessage: `Running ${formatToolTitle(eventData.name)}…`,
                              toolCalls: [...(m.toolCalls || []), newToolCall],
                            }
                          : m,
                      ),
                    }
                  : t,
              ),
            )
          } else if (eventName === 'tool_result') {
            setThreads((prev) =>
              prev.map((t) =>
                t.id === activeThread.id
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              toolCalls: (m.toolCalls || []).map((tc) =>
                                tc.id === eventData.id ||
                                tc.name === eventData.name
                                  ? {
                                      ...tc,
                                      result: eventData.result,
                                      status: 'completed',
                                      durationMs: eventData.durationMs,
                                    }
                                  : tc,
                              ),
                            }
                          : m,
                      ),
                    }
                  : t,
              ),
            )
          } else if (eventName === 'done') {
            patchAssistant({ statusStage: 'done', statusMessage: '' })
          } else if (eventName === 'error') {
            toast.error(eventData.message || 'Agent error')
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error(`Agent request failed: ${err.message}`)
        setThreads((prev) =>
          prev.map((t) =>
            t.id === activeThread.id
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content:
                            (m.content || '') +
                            `\n\n> Error: ${err.message}. Check that NVIDIA_API_KEY is active.`,
                        }
                      : m,
                  ),
                }
              : t,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  const exportInvestigation = () => {
    const threadData = {
      id: activeThread.id,
      title: activeThread.title,
      exportedAt: new Date().toISOString(),
      messages: activeThread.messages.map((m) => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        toolCalls: m.toolCalls,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
    }
    const blob = new Blob([JSON.stringify(threadData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openkyc-case-${activeThread.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Case exported')
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-fg">Agent</h1>
          <p className="truncate text-xs text-muted-fg">
            Query verification records, FalkorDB graph algorithms, and documents.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" intent="outline" onClick={exportInvestigation}>
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" intent="primary" onClick={handleCreateNewThread}>
            <Plus className="size-3.5" />
            <span>New</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Cases sidebar */}
        {showHistory && (
          <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-border/60 pr-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-fg">Cases</span>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 text-muted-fg hover:text-fg"
                title="Hide cases"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(
                  e.target.value as 'all' | 'customer' | 'employee' | 'graph',
                )
              }
              aria-label="Filter cases"
              className="mb-2 w-full rounded-lg border border-border/70 bg-card px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All cases</option>
              <option value="customer">Customers</option>
              <option value="employee">Employees</option>
              <option value="graph">Graph analysis</option>
            </select>

            <div className="flex-1 space-y-0.5 overflow-y-auto pr-1">
              {threads.map((thread) => {
                const isActive = thread.id === activeThread.id
                return (
                  <div
                    key={thread.id}
                    onClick={() => setActiveThreadId(thread.id)}
                    className={`group flex cursor-pointer items-center justify-between gap-1 rounded-lg px-2 py-1.5 ${
                      isActive
                        ? 'bg-muted text-fg'
                        : 'text-muted-fg hover:bg-muted/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {thread.title}
                      </p>
                      <p className="text-[10px] text-muted-fg">
                        {new Date(thread.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteThread(thread.id, e)}
                      className="p-1 text-muted-fg opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                      title="Delete case"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        {/* Conversation */}
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {!showHistory && (
            <button
              onClick={() => setShowHistory(true)}
              className="absolute left-0 top-0 z-10 flex items-center gap-1 text-xs text-muted-fg hover:text-fg"
            >
              <ChevronRight className="size-3.5" />
              Cases
            </button>
          )}

          {/* Messages */}
          <div
            className={`flex-1 space-y-6 overflow-y-auto pb-4 ${
              showHistory ? '' : 'pl-16'
            }`}
          >
            {activeThread.messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] space-y-2">
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Attachment"
                          className="ml-auto max-h-48 rounded-lg border border-border object-cover"
                        />
                      )}
                      {msg.content && (
                        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-3.5 py-2.5 text-sm text-fg">
                          {msg.content}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              const toolsOpen = toolsExpanded[msg.id] ?? false

              return (
                <div key={msg.id} className="space-y-3 text-sm">
                  {/* Streaming status */}
                  {isStreaming && !msg.content && msg.statusStage !== 'done' && (
                    <div className="flex items-center gap-2 text-xs text-muted-fg">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{msg.statusMessage || 'Working…'}</span>
                    </div>
                  )}

                  {/* Tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleTools(msg.id)}
                        className="flex items-center gap-1 text-xs text-muted-fg hover:text-fg"
                      >
                        <ChevronRight
                          className={`size-3 transition-transform ${
                            toolsOpen ? 'rotate-90' : ''
                          }`}
                        />
                        {msg.toolCalls.length} tool call
                        {msg.toolCalls.length === 1 ? '' : 's'}
                      </button>

                      {toolsOpen && (
                        <div className="mt-2 space-y-1">
                          {msg.toolCalls.map((tc) => (
                            <details
                              key={tc.id}
                              className="group rounded-lg border border-border/60 text-xs"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5">
                                <span className="flex items-center gap-1.5 text-fg">
                                  <ChevronRight className="size-3 text-muted-fg transition-transform group-open:rotate-90" />
                                  {formatToolTitle(tc.name)}
                                </span>
                                <span className="text-[11px] text-muted-fg">
                                  {tc.status === 'running' ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : tc.durationMs !== undefined ? (
                                    `${tc.durationMs} ms`
                                  ) : (
                                    'done'
                                  )}
                                </span>
                              </summary>
                              <div className="space-y-2 border-t border-border/40 px-2.5 py-2">
                                {Object.keys(tc.arguments || {}).length > 0 && (
                                  <div className="flex flex-wrap gap-1 font-mono text-[10px] text-muted-fg">
                                    {Object.entries(tc.arguments).map(([k, v]) => (
                                      <span
                                        key={k}
                                        className="rounded bg-muted px-1 py-0.5"
                                      >
                                        {k}:{' '}
                                        {typeof v === 'object'
                                          ? JSON.stringify(v)
                                          : String(v)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {tc.result && <ToolFindingsView tc={tc} />}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reasoning */}
                  {msg.reasoning && (
                    <details className="group text-xs text-muted-fg">
                      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 hover:text-fg">
                        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                        Reasoning
                      </summary>
                      <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {msg.reasoning}
                      </div>
                    </details>
                  )}

                  {/* Answer */}
                  {msg.content && <AgentResponseDisplay content={msg.content} />}

                  {/* Message footer */}
                  {msg.content && (
                    <div className="flex items-center gap-3 text-[11px] text-muted-fg">
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        onClick={() => copyToClipboard(msg.content)}
                        className="flex items-center gap-1 hover:text-fg"
                        title="Copy response"
                      >
                        <Copy className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {activeThread.messages.length <= 1 && (
            <div className="border-t border-border/40 py-3">
              <p className="mb-2 text-[11px] text-muted-fg">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SUGGESTIONS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleSendMessage(preset.query)}
                    className="rounded-lg border border-border/70 px-2.5 py-1 text-xs text-fg transition-colors hover:bg-muted"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border/60 pt-3">
            {selectedImage && (
              <div className="mb-2 flex w-fit items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-xs text-fg">
                <Paperclip className="size-3.5 text-muted-fg" />
                <span className="max-w-xs truncate">
                  {imageFileName || 'Image attached'}
                </span>
                <button
                  onClick={removeSelectedImage}
                  className="p-0.5 text-muted-fg hover:text-fg"
                  title="Remove image"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2 rounded-xl border border-border p-2 focus-within:ring-1 focus-within:ring-primary/30">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="rounded-lg p-2 text-muted-fg transition-colors hover:bg-muted hover:text-fg disabled:opacity-40"
                title="Attach an image"
              >
                <Paperclip className="size-4" />
              </button>

              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                disabled={isStreaming}
                placeholder="Ask about a customer, employee, or pattern…"
                rows={1}
                className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent py-1.5 text-sm text-fg placeholder:text-muted-fg focus:outline-none focus:ring-0"
              />

              {isStreaming ? (
                <Button
                  size="sm"
                  intent="outline"
                  onClick={handleStopGeneration}
                  className="h-9 gap-1.5"
                >
                  <Square className="size-3 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  intent="primary"
                  onClick={() => handleSendMessage()}
                  isDisabled={!inputPrompt.trim() && !selectedImage}
                  className="h-9 gap-1.5"
                >
                  <span>Send</span>
                  <Send className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
