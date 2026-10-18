import { FalkorDBClient } from '../client.js'
import type {
  ComplianceAction,
  ComprehensiveAMLReport,
  RiskLevel,
} from '../types.js'
import { CentralityDetector } from './centrality.js'
import { CycleDetector } from './cycleDetection.js'
import { EntityResolutionDetector } from './entityResolution.js'
import { RiskTracingDetector } from './riskTracing.js'
import { ScatterGatherDetector } from './scatterGather.js'
import { SmurfingDetector } from './smurfing.js'

export class AMLRiskScorer {
  private client: FalkorDBClient
  private entityDetector: EntityResolutionDetector
  private cycleDetector: CycleDetector
  private smurfingDetector: SmurfingDetector
  private scatterGatherDetector: ScatterGatherDetector
  private centralityDetector: CentralityDetector
  private riskTracingDetector: RiskTracingDetector

  constructor(client: FalkorDBClient) {
    this.client = client
    this.entityDetector = new EntityResolutionDetector(client)
    this.cycleDetector = new CycleDetector(client)
    this.smurfingDetector = new SmurfingDetector(client)
    this.scatterGatherDetector = new ScatterGatherDetector(client)
    this.centralityDetector = new CentralityDetector(client)
    this.riskTracingDetector = new RiskTracingDetector(client)
  }

  /**
   * Generates a comprehensive AML risk evaluation and compliance report for a specific account.
   */
  async evaluateAccount(accountId: string): Promise<ComprehensiveAMLReport> {
    // 1. Fetch account metadata
    const accRes = await this.client.query<{
      id: string
      accountNumber: string
      bank: string
      type: string
      balance: number
      isSanctioned: boolean
      isPEP: boolean
    }>(`MATCH (a:Account {id: '${accountId}'}) RETURN a.id AS id, a.accountNumber AS accountNumber, a.bank AS bank, a.type AS type, a.balance AS balance, a.isSanctioned AS isSanctioned, a.isPEP AS isPEP`)

    if (accRes.data.length === 0) {
      throw new Error(`Account '${accountId}' not found in graph '${this.client.graphName}'`)
    }

    const acc = accRes.data[0]
    const flags: string[] = []
    const isSanctioned = acc.isSanctioned === true || String(acc.isSanctioned) === 'true'
    const isPEP = acc.isPEP === true || String(acc.isPEP) === 'true'

    // Direct sanctions check
    if (isSanctioned) {
      flags.push('CRITICAL_SANCTION_LISTED_ENTITY')
    }
    if (isPEP) {
      flags.push('POLITICALLY_EXPOSED_PERSON')
    }

    // 2. Run all typologies concurrently
    const [
      entityRes,
      cycleRes,
      smurfingRes,
      scatterGatherRes,
      centralityRes,
      sanctionRes,
    ] = await Promise.all([
      this.entityDetector.resolveEntities(),
      this.cycleDetector.detectCycles(),
      this.smurfingDetector.detectSmurfing(),
      this.scatterGatherDetector.detectScatterGather(),
      this.centralityDetector.computeCentrality(),
      this.riskTracingDetector.traceSanctionExposures(),
    ])

    // Filter relevant patterns for this account
    const matchedCycles = cycleRes.detectedCycles.filter((c) =>
      c.accounts.includes(accountId),
    )
    const matchedFanIn = smurfingRes.fanInStructuring.filter(
      (f) => f.targetAccountId === accountId || f.sourceAccountIds.includes(accountId),
    )
    const matchedFanOut = smurfingRes.fanOutStructuring.filter(
      (f) => f.sourceAccountId === accountId || f.targetAccountIds.includes(accountId),
    )
    const matchedScatterGather = scatterGatherRes.patterns.filter(
      (p) =>
        p.sourceAccountId === accountId ||
        p.destinationAccountId === accountId ||
        p.muleAccountIds.includes(accountId),
    )
    const matchedSanctions = sanctionRes.exposures.filter(
      (e) => e.targetAccountId === accountId || e.path.includes(accountId),
    )
    const matchedEntityCluster = entityRes.clusters.find((c) =>
      c.associatedAccountIds.includes(accountId),
    )
    const matchedHub = centralityRes.flowHubs.find((h) => h.accountId === accountId)
    const matchedPR = centralityRes.pageRank.find((p) => p.accountId === accountId)

    // Calculate sub-scores (0 to 100)
    let cycleScore = 0
    if (matchedCycles.length > 0) {
      cycleScore = Math.round(Math.max(...matchedCycles.map((c) => c.riskScore)) * 100)
      flags.push(`CIRCULAR_FLOW_ROUND_TRIPPING (${matchedCycles[0].cycleLength}-hop)`)
    }

    let smurfingScore = 0
    if (matchedFanIn.length > 0) {
      const best = matchedFanIn[0]
      smurfingScore = Math.max(smurfingScore, Math.round(best.riskScore * 100))
      flags.push(`FAN_IN_STRUCTURING_AGGREGATION ($${best.totalAmount.toLocaleString()} across ${best.transactionCount} deposits)`)
    }
    if (matchedFanOut.length > 0) {
      const best = matchedFanOut[0]
      smurfingScore = Math.max(smurfingScore, Math.round(best.riskScore * 100))
      flags.push(`FAN_OUT_STRUCTURING_DISPERSION ($${best.totalAmount.toLocaleString()} across ${best.transactionCount} accounts)`)
    }

    let scatterGatherScore = 0
    if (matchedScatterGather.length > 0) {
      const best = matchedScatterGather[0]
      scatterGatherScore = Math.round(best.riskScore * 100)
      const role =
        best.sourceAccountId === accountId
          ? 'Scatter Origin'
          : best.destinationAccountId === accountId
            ? 'Consolidation Destination'
            : 'Pass-through Mule'
      flags.push(`SCATTER_GATHER_LAYERING (${role} with ${best.muleAccountIds.length} mules)`)
    }

    let sanctionsScore = isSanctioned ? 100 : 0
    if (matchedSanctions.length > 0) {
      const best = matchedSanctions[0]
      sanctionsScore = Math.max(sanctionsScore, Math.round(best.decayedRiskScore * 100))
      flags.push(`SANCTIONS_EXPOSURE (${best.hopDistance}-hop link to OFAC/SDN ${best.sanctionedAccountId})`)
    }

    let entityScore = 0
    if (matchedEntityCluster && matchedEntityCluster.memberPersonIds.length > 1) {
      entityScore = Math.round(matchedEntityCluster.confidence * 100)
      flags.push(`SYNTHETIC_IDENTITY_SHARED_CREDENTIALS (${matchedEntityCluster.memberPersonIds.length} linked entity profiles)`)
    }

    let centralityScore = 0
    if (matchedHub && (matchedHub.role === 'funnel_aggregator' || matchedHub.role === 'transit_hub')) {
      centralityScore = matchedHub.role === 'funnel_aggregator' ? 70 : 60
      flags.push(`HIGH_CENTRALITY_HUB (${matchedHub.role.replace('_', ' ').toUpperCase()})`)
    } else if (matchedPR && matchedPR.rank <= 3) {
      centralityScore = 50
    }

    // Composite Multi-Typology Score
    let composite = 0
    if (isSanctioned) {
      composite = 100
    } else {
      const maxTypologyRisk = Math.max(
        sanctionsScore,
        cycleScore,
        smurfingScore,
        scatterGatherScore,
        entityScore,
      )

      if (maxTypologyRisk > 0) {
        const secondaryCount =
          (sanctionsScore > 0 ? 1 : 0) +
          (cycleScore > 0 ? 1 : 0) +
          (smurfingScore > 0 ? 1 : 0) +
          (scatterGatherScore > 0 ? 1 : 0) +
          (entityScore > 0 ? 1 : 0) -
          1
        const hubBonus = centralityScore >= 60 ? 8 : 0
        composite = Math.min(
          100,
          Math.round(maxTypologyRisk * 0.9 + Math.max(0, secondaryCount) * 5 + hubBonus),
        )
      } else {
        composite = Math.min(100, Math.round(centralityScore * 0.2))
      }
    }

    // Determine Risk Level & Compliance Action
    let riskLevel: RiskLevel = 'CLEAN'
    let recommendedAction: ComplianceAction = 'APPROVE'

    if (composite >= 85 || isSanctioned) {
      riskLevel = 'CRITICAL'
      recommendedAction = 'FREEZE_ACCOUNTS'
    } else if (composite >= 70) {
      riskLevel = 'HIGH'
      recommendedAction = 'FILE_SAR'
    } else if (composite >= 40) {
      riskLevel = 'MEDIUM'
      recommendedAction = 'ENHANCED_DUE_DILIGENCE'
    } else if (composite >= 20) {
      riskLevel = 'LOW'
      recommendedAction = 'ENHANCED_DUE_DILIGENCE'
    }

    // Build SAR narrative summary
    let summary = `AML Compliance Assessment for Account ${acc.accountNumber || accountId} (${acc.bank}, ${acc.type}): `
    if (flags.length === 0) {
      summary += 'No suspicious money laundering patterns, circular layering, or sanctions exposure detected. Normal retail/commercial flow.'
    } else {
      summary += `High risk signals detected (${flags.join('; ')}). Recommended action: ${recommendedAction}.`
    }

    return {
      subjectAccountId: accountId,
      subjectAccountNumber: acc.accountNumber || accountId,
      riskScore: composite,
      riskLevel,
      recommendedAction,
      flags,
      typologyBreakdown: {
        entityResolutionRisk: entityScore,
        cycleRisk: cycleScore,
        smurfingRisk: smurfingScore,
        scatterGatherRisk: scatterGatherScore,
        sanctionsRisk: sanctionsScore,
        centralityRisk: centralityScore,
      },
      suspiciousActivitySummary: summary,
      detectedTypologies: {
        cycles: matchedCycles,
        smurfingFanIn: matchedFanIn,
        smurfingFanOut: matchedFanOut,
        scatterGather: matchedScatterGather,
        sanctionsExposure: matchedSanctions,
        entityCluster: matchedEntityCluster,
      },
    }
  }
}
