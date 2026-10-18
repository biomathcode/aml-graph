import { useState } from 'react'
import {
  Network,
  ArrowRight,
  RotateCw,
  Database,
  Code,
  Copy,
  Check,
  ShieldAlert,
  Building,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import type { GraphFlowData, GraphFlowNode } from './types'

interface GraphFlowVisualizerProps {
  data: GraphFlowData
}

export function GraphFlowVisualizer({ data }: GraphFlowVisualizerProps) {
  const [showCypher, setShowCypher] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedNode, setSelectedNode] = useState<GraphFlowNode | null>(
    data.nodes[0] || null,
  )

  const copyCypher = () => {
    if (!data.cypherQuery) return
    navigator.clipboard.writeText(data.cypherQuery)
    setCopied(true)
    toast.success('FalkorDB Cypher query copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const getNodeIcon = (role: GraphFlowNode['role']) => {
    switch (role) {
      case 'origin':
      case 'beneficiary':
        return User
      case 'shell':
      case 'intermediary':
        return Building
      case 'sanctioned':
        return ShieldAlert
      default:
        return User
    }
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-md overflow-hidden text-xs shadow-xs">
      {/* Header */}
      <div className="px-4 py-3 bg-muted/40 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Network className="size-3.5" />
          </div>
          <div>
            <span className="font-semibold text-fg block text-xs">
              {data.typologyTitle}
            </span>
            <span className="text-[10px] text-muted-fg font-mono">
              FalkorDB Graph Algorithm Trace
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data.preservationRate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <RotateCw className="size-2.5 animate-spin duration-3000" />
              {data.preservationRate} Returned
            </span>
          )}

          {data.cypherQuery && (
            <button
              onClick={() => setShowCypher(!showCypher)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-fg hover:text-fg font-mono text-[10px] border border-border/60 transition-colors"
            >
              <Database className="size-3 text-primary" />
              <span>{showCypher ? 'Hide Cypher' : 'View Cypher'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cypher Drawer */}
      {showCypher && data.cypherQuery && (
        <div className="p-3 bg-black/85 text-emerald-300 font-mono text-[11px] border-b border-border/40 relative">
          <div className="flex items-center justify-between mb-1.5 text-muted-fg">
            <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400 flex items-center gap-1">
              <Code className="size-3" />
              FalkorDB OpenCypher Pattern
            </span>
            <button
              onClick={copyCypher}
              className="flex items-center gap-1 text-[10px] text-muted-fg hover:text-white"
            >
              {copied ? (
                <Check className="size-3 text-emerald-400" />
              ) : (
                <Copy className="size-3" />
              )}
              <span>{copied ? 'Copied' : 'Copy Query'}</span>
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
            {data.cypherQuery}
          </pre>
        </div>
      )}

      {/* Interactive Visual Graph Canvas Area */}
      <div className="p-4 sm:p-5 relative bg-gradient-to-b from-muted/20 via-card/50 to-muted/10">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

        {/* Nodes Flow Rail */}
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 my-2">
          {data.nodes.map((node, idx) => {
            const isSelected = selectedNode?.id === node.id
            const NodeIcon = getNodeIcon(node.role)
            const isOrigin = node.role === 'origin'
            const isCritical = node.riskLevel === 'critical'

            return (
              <div
                key={node.id}
                className="flex flex-col md:flex-row items-center gap-3 sm:gap-4 flex-1 w-full md:w-auto"
              >
                {/* Node Card */}
                <button
                  onClick={() => setSelectedNode(node)}
                  className={`flex-1 w-full p-3 rounded-xl border text-left transition-all relative group cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                      : isCritical
                        ? 'border-rose-500/40 bg-card/90 hover:border-rose-500/70'
                        : 'border-border/70 bg-card/90 hover:border-border'
                  }`}
                >
                  {/* Status Indicator */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full border ${
                        isOrigin
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : isCritical
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : 'bg-muted text-muted-fg border-border/40'
                      }`}
                    >
                      {node.role}
                    </span>
                    {node.accountNo && (
                      <span className="text-[10px] font-mono text-muted-fg">
                        {node.accountNo}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`size-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        isCritical
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-muted/80 border-border/60 text-fg'
                      }`}
                    >
                      <NodeIcon className="size-3.5" />
                    </div>
                    <div className="truncate">
                      <span className="font-semibold text-fg block text-xs truncate">
                        {node.label}
                      </span>
                      {node.amount && (
                        <span className="text-[11px] font-mono font-bold text-fg/90">
                          {node.amount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Connecting Edge Arrow (hidden for last node on desktop) */}
                {idx < data.nodes.length - 1 && (
                  <div className="flex flex-col items-center justify-center text-muted-fg shrink-0 py-1 md:py-0">
                    <span className="text-[9px] font-mono font-bold text-primary block text-center mb-0.5">
                      {data.edges[idx]?.amount || 'Transfer'}
                    </span>
                    <div className="flex items-center">
                      <div className="hidden md:block w-6 sm:w-10 h-0.5 bg-gradient-to-r from-primary/30 to-primary relative overflow-hidden">
                        <div className="absolute inset-0 bg-primary/80 animate-pulse" />
                      </div>
                      <ArrowRight className="size-3.5 text-primary rotate-90 md:rotate-0" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Circular Return Loop Indicator Banner */}
        {data.edges.some((e) => e.highlighted) && (
          <div className="relative z-10 mt-4 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <RotateCw className="size-4 text-rose-400 shrink-0" />
              <span>
                <strong>Circular Flow Confirmed:</strong> Funds returned to
                origin ({data.nodes[0]?.label}) with {data.preservationRate || '95%'} capital retention.
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-200">
              Money Laundering Typology
            </span>
          </div>
        )}
      </div>

      {/* Selected Node Inspector Footer */}
      {selectedNode && (
        <div className="px-4 py-2.5 bg-muted/30 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-fg">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-fg">Active Inspect:</span>
            <span>{selectedNode.label}</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted">
              {selectedNode.accountNo || 'Primary Graph Node'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-primary font-medium">
            Node Role: {selectedNode.role.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}
