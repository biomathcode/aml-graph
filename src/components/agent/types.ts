export type RiskLevel = 'clean' | 'low' | 'medium' | 'high' | 'critical'

export interface ParsedVerdict {
  entityName: string
  entityType: 'customer' | 'employee' | 'network' | 'contractor'
  riskScore: number // 0 - 100
  riskLevel: RiskLevel
  classification: string
  summary: string
  nationalityOrJurisdiction?: string
  departmentOrRole?: string
  flags: string[]
}

export interface ParsedKpis {
  riskScore: number
  riskLevel: RiskLevel
  cyclesCount: number
  structuringAlerts: number
  preservationRate?: string
  totalExposure?: string
  flagCount: number
  hopsCount: number
  confidenceScore?: number
}

export interface GraphFlowNode {
  id: string
  label: string
  role: 'origin' | 'mule' | 'shell' | 'beneficiary' | 'sanctioned' | 'intermediary'
  accountNo?: string
  amount?: string
  riskLevel?: RiskLevel
}

export interface GraphFlowEdge {
  from: string
  to: string
  amount?: string
  label?: string
  highlighted?: boolean
}

export interface GraphFlowData {
  nodes: GraphFlowNode[]
  edges: GraphFlowEdge[]
  typologyTitle: string
  cypherQuery?: string
  preservationRate?: string
}

export interface RiskFactorItem {
  category: string
  score: number
  maxScore: number
  severity: RiskLevel
  description: string
}

export interface RecommendationItem {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  statutoryRef?: string
  actionKey?: string
}

export interface CitationItem {
  id: string
  source: 'postgresql' | 'falkordb-graph' | 'kyc-documents' | 'employee-kb'
  title: string
  category: string
  snippet?: string
  verified: boolean
}

export interface ParsedTableData {
  headers: string[]
  rows: string[][]
  title?: string
}

export interface ParsedAgentResponse {
  verdict: ParsedVerdict
  kpis: ParsedKpis
  graphFlow?: GraphFlowData
  riskFactors: RiskFactorItem[]
  recommendations: RecommendationItem[]
  citations: CitationItem[]
  tables: ParsedTableData[]
}
