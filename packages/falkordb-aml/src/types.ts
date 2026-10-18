export type AccountType =
  | 'checking'
  | 'savings'
  | 'business'
  | 'shell_corporate'
  | 'crypto_exchange'
  | 'mule'

export interface AccountNode {
  id: string
  accountNumber: string
  bank: string
  country: string
  type: AccountType
  balance: number
  isSanctioned?: boolean
  isPEP?: boolean
  initialRiskScore?: number
}

export interface PersonNode {
  id: string
  name: string
  email?: string
  phone?: string
  address?: string
  taxId?: string
  deviceId?: string
  ipAddress?: string
  nationality?: string
  isPEP?: boolean
  isSanctioned?: boolean
}

export type IdentifierType =
  'email' | 'phone' | 'address' | 'taxId' | 'deviceId' | 'ip' | 'documentNumber'

export interface IdentifierNode {
  type: IdentifierType
  value: string
}

export type TypologyLabel =
  | 'normal'
  | 'cycle'
  | 'smurfing_fan_in'
  | 'smurfing_fan_out'
  | 'scatter_gather'
  | 'sanctions_flow'
  | 'nk_it_worker_funding'

export interface TransactionEdge {
  id: string
  sourceAccountId: string
  targetAccountId: string
  amount: number
  currency: string
  timestamp: number // unix epoch ms
  type: 'wire' | 'ach' | 'cash_deposit' | 'crypto_swap' | 'internal_transfer'
  groundTruthTypology?: TypologyLabel
  notes?: string
}

export interface AMLDataset {
  name: string
  description: string
  accounts: AccountNode[]
  persons: PersonNode[]
  ownership: Array<{
    personId: string
    accountId: string
    role?: 'owner' | 'signatory' | 'beneficiary'
  }>
  transactions: TransactionEdge[]
  groundTruthTypologies: Array<{
    typology: TypologyLabel
    description: string
    involvedAccounts: string[]
    involvedTransactions: string[]
  }>
}

export interface EntityPairMatch {
  personA: string
  personB: string
  personAName: string
  personBName: string
  sharedIdentifiers: Array<{ type: IdentifierType; value: string }>
  similarityScore: number
}

export interface EntityCluster {
  clusterId: string
  masterPersonId: string
  masterPersonName: string
  memberPersonIds: string[]
  sharedIdentifiers: Array<{ type: IdentifierType; value: string }>
  confidence: number
  associatedAccountIds: string[]
}

export interface EntityResolutionResult {
  pairwiseMatches: EntityPairMatch[]
  clusters: EntityCluster[]
  syntheticIdentityRiskAlerts: Array<{
    personId: string
    personName: string
    reason: string
    riskScore: number
  }>
}

export interface ComponentData {
  componentId: number
  nodeCount: number
  accountIds: string[]
  totalVolume: number
  transactionCount: number
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH'
}

export interface WCCResult {
  totalComponents: number
  components: ComponentData[]
  largestComponentSize: number
}

export interface PageRankNode {
  accountId: string
  accountNumber: string
  score: number
  rank: number
}

export interface FlowHubNode {
  accountId: string
  inDegree: number
  outDegree: number
  inVolume: number
  outVolume: number
  flowRatio: number
  role: 'funnel_aggregator' | 'dispersion_source' | 'transit_hub' | 'balanced'
}

export interface CentralityResult {
  pageRank: PageRankNode[]
  flowHubs: FlowHubNode[]
}

export interface DetectedCycle {
  cycleId: string
  cycleLength: number
  accounts: string[]
  transactionIds: string[]
  totalVolume: number
  firstTimestamp: number
  lastTimestamp: number
  durationHours: number
  amountPreservationRate: number
  riskScore: number
}

export interface CycleResult {
  detectedCycles: DetectedCycle[]
  totalCyclesFound: number
}

export interface FanInPattern {
  targetAccountId: string
  targetAccountNumber: string
  sourceAccountIds: string[]
  transactionCount: number
  totalAmount: number
  avgAmount: number
  threshold: number
  timeWindowHours: number
  riskScore: number
  transactions: string[]
}

export interface FanOutPattern {
  sourceAccountId: string
  sourceAccountNumber: string
  targetAccountIds: string[]
  transactionCount: number
  totalAmount: number
  avgAmount: number
  threshold: number
  timeWindowHours: number
  riskScore: number
  transactions: string[]
}

export interface SmurfingResult {
  fanInStructuring: FanInPattern[]
  fanOutStructuring: FanOutPattern[]
  totalStructuringAlerts: number
}

export interface ScatterGatherPattern {
  patternId: string
  sourceAccountId: string
  destinationAccountId: string
  muleAccountIds: string[]
  sourceAmount: number
  gatheredAmount: number
  leakageRate: number
  transitVelocityHours: number
  riskScore: number
  inboundTxIds: string[]
  outboundTxIds: string[]
}

export interface ScatterGatherResult {
  patterns: ScatterGatherPattern[]
  totalPatternsFound: number
}

export interface SanctionExposure {
  targetAccountId: string
  sanctionedAccountId: string
  sanctionedBank?: string
  path: string[]
  hopDistance: number
  directTransfer: boolean
  decayedRiskScore: number
}

export interface RiskTracingResult {
  exposures: SanctionExposure[]
  totalExposuresFound: number
}

/**
 * North Korean IT-worker (DPRK remote-worker scheme) screening types.
 * Grounded in the joint advisory from July 2026 and UNSCR 2397 obligations:
 * fake identities, third-party proxy infrastructure ("laptop farms"),
 * cryptocurrency/USDT remittances, and DPRK front-company payment channels.
 */
export interface NkWorkerIndicator {
  /** Stable rule code, e.g. I3_LAPTOP_FARM_INFRA */
  code: string
  /** Human-readable detection rule */
  rule: string
  /** Additive contribution to the subject's 0-100 DPRK-exposure score */
  weight: number
  /** Graph evidence strings backing the hit */
  evidence: string[]
}

export interface NkWorkerSubject {
  personId: string
  personName: string
  claimedNationality?: string
  riskScore: number
  riskLevel: RiskLevel
  indicators: NkWorkerIndicator[]
  recommendedAction: string
}

export interface NkSharedInfrastructure {
  identifierType: IdentifierType
  value: string
  linkedPersonIds: string[]
  linkedPersonNames: string[]
  note: string
}

export interface NkFrontCompanyFlow {
  subjectPersonId: string
  subjectPersonName: string
  fromAccountId: string
  toAccountId: string
  toBank?: string
  toCountry?: string
  amount: number
  currency: string
  transactionType?: string
  matchedToken: string
}

export interface NkCryptoRemittanceFlow {
  subjectPersonId: string
  subjectPersonName: string
  fromAccountId: string
  toAccountId: string
  amount: number
  currency: string
  transactionType: string
}

export interface NkWorkerResult {
  personsEvaluated: number
  /** Subjects whose ind-scored icator set crosses the reporting threshold */
  suspectedNkWorkers: NkWorkerSubject[]
  sharedInfrastructure: NkSharedInfrastructure[]
  frontCompanyRemittances: NkFrontCompanyFlow[]
  cryptoRemittanceFlows: NkCryptoRemittanceFlow[]
  totalAlerts: number
  framework: {
    alertSource: string
    references: string[]
    regulatoryActions: string[]
  }
}

export type RiskLevel = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ComplianceAction =
  'APPROVE' | 'ENHANCED_DUE_DILIGENCE' | 'FILE_SAR' | 'FREEZE_ACCOUNTS'

export interface ComprehensiveAMLReport {
  subjectAccountId: string
  subjectAccountNumber: string
  riskScore: number // 0 to 100
  riskLevel: RiskLevel
  recommendedAction: ComplianceAction
  flags: string[]
  typologyBreakdown: {
    entityResolutionRisk: number
    cycleRisk: number
    smurfingRisk: number
    scatterGatherRisk: number
    sanctionsRisk: number
    centralityRisk: number
  }
  suspiciousActivitySummary: string
  detectedTypologies: {
    cycles?: DetectedCycle[]
    smurfingFanIn?: FanInPattern[]
    smurfingFanOut?: FanOutPattern[]
    scatterGather?: ScatterGatherPattern[]
    sanctionsExposure?: SanctionExposure[]
    entityCluster?: EntityCluster
  }
}
