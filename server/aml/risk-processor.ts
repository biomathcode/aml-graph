/**
 * Deterministic AML risk processor.
 *
 * Runs the typed FalkorDB AML detectors (@open-kyc/falkordb-aml) against the
 * knowledge graph for a KYC subject and assembles a structured, rule-based
 * AmlRiskReport — no LLM required for the verdict. Detectors follow the
 * shapes exported from packages/falkordb-aml/src/types.ts (CycleResult,
 * SmurfingResult, ScatterGatherResult, EntityResolutionResult,
 * CentralityResult, RiskTracingResult, NkWorkerResult).
 */

import {
  FalkorDBClient,
  CycleDetector,
  SmurfingDetector,
  ScatterGatherDetector,
  EntityResolutionDetector,
  CentralityDetector,
  RiskTracingDetector,
  NkWorkerDetector,
} from '../../packages/falkordb-aml/src/index.js'
import type { AmlSignal, AmlRiskReport } from '@open-kyc/contracts'

interface SubjectInput {
  /** Session/node id of the subject in the graph (:Person {id}). */
  personId?: string
  personName: string
  submittedIdentifiers: Array<{ type: string; value: string }>
}

function escapeCypher(str?: string | number | null): string {
  if (str === undefined || str === null) return ''
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function contains(haystack: unknown, needle: string): boolean {
  const hay = String(haystack ?? '').toLowerCase()
  return Boolean(hay) && (hay.includes(needle) || needle.includes(hay))
}

/** Normalized full-name equality helper — loose substring name matching
 * ("MICHAEL" ~ "Michael Torres") would graft *other* persons' screening
 * results onto this subject's report; exact-name matching keeps reports
 * scoped to the subject. */
function normalizedName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

async function runDetector<T>(
  label: string,
  fn: (falkor: FalkorDBClient) => Promise<T>,
  falkor: FalkorDBClient,
): Promise<T | null> {
  try {
    return await fn(falkor)
  } catch (err) {
    console.warn(`[risk-processor] ${label} failed:`, (err as Error).message)
    return null
  }
}

async function subjectOwnedAccounts(
  falkor: FalkorDBClient,
  subject: SubjectInput,
): Promise<{ accountIds: string[]; accountNumbers: string[] }> {
  const accountIds: string[] = []
  const accountNumbers: string[] = []
  const fetch = async (where: string) => {
    const res = await falkor.query<{ id: string; accountNumber?: string }>(
      `MATCH (p:Person)-[:OWNS]->(a:Account) ${where} RETURN a.id AS id, a.accountNumber AS accountNumber`,
    )
    for (const row of res.data) {
      if (row.id && !accountIds.includes(String(row.id)))
        accountIds.push(String(row.id))
      if (
        row.accountNumber &&
        !accountNumbers.includes(String(row.accountNumber))
      )
        accountNumbers.push(String(row.accountNumber))
    }
  }
  if (subject.personId) {
    try {
      await fetch(`WHERE p.id = '${escapeCypher(subject.personId)}'`)
    } catch {}
  }
  const name = subject.personName.trim().toLowerCase()
  if (name) {
    try {
      await fetch(`WHERE toLower(p.name) CONTAINS '${escapeCypher(name)}'`)
    } catch {}
  }
  return { accountIds, accountNumbers }
}

function signalWeight(severity: AmlSignal['severity']): number {
  switch (severity) {
    case 'high':
      return 35
    case 'medium':
      return 18
    case 'low':
      return 8
    default:
      return 3
  }
}

function levelForScore(score: number): AmlRiskReport['level'] {
  if (score >= 70) return 'critical'
  if (score >= 45) return 'high'
  if (score >= 25) return 'medium'
  if (score >= 10) return 'low'
  return 'clean'
}

/**
 * Builds the AML risk report via graph analytics. Returns null when FalkorDB
 * is unreachable so the pipeline can mark the session's AML status as
 * unavailable (jobs are retried by the AML loop).
 */
export async function buildGraphAmlReport(
  falkor: FalkorDBClient,
  subject: SubjectInput,
): Promise<AmlRiskReport | null> {
  if (!subject.personName?.trim()) return null

  // Reachability gate: scoring an unreachable graph would falsely report
  // 'clean'; treat as unavailable so the pipeline can fall back.
  try {
    const ok = await Promise.race([
      falkor.ping(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ])
    if (!ok) return null
  } catch {
    return null
  }

  // Subject ownership scope for account/typology correlation.
  const { accountIds, accountNumbers } = await subjectOwnedAccounts(
    falkor,
    subject,
  )
  // Identifier values self-reported by the subject (used to scope shared
  // infrastructure checks to identifiers the subject itself carries).
  const identifierValues = subject.submittedIdentifiers
    .map((i) =>
      String(i.value ?? '')
        .toLowerCase()
        .trim(),
    )
    .filter(Boolean)

  const ownsInvolved = (
    ...candidates: Array<string | string[] | undefined>
  ) => {
    for (const candidate of candidates.flat()) {
      const value = String(candidate ?? '').toLowerCase()
      if (!value) continue
      if (accountIds.some((a) => contains(a, value) || value.includes(a)))
        return true
      if (accountNumbers.some((a) => contains(a, value) || value.includes(a)))
        return true
    }
    return false
  }

  let signals: AmlSignal[] = []
  const algorithmsRun: string[] = []
  const hasData = () => signals.length > 0

  // 1. Cycle detection — round-tripping money laundering
  const cycles = await runDetector(
    'cycle_detection',
    (c) => new CycleDetector(c).detectCycles(),
    falkor,
  )
  if (cycles) {
    algorithmsRun.push('cycle_detection')
    for (const cycle of cycles.detectedCycles) {
      if (ownsInvolved(cycle.accounts)) {
        signals.push({
          type: 'round_tripping_cycle',
          severity: cycle.riskScore >= 0.7 ? 'high' : 'medium',
          detail: `Subject-owned account participates in a ${cycle.cycleLength}-hop fund cycle (${cycle.accounts.join(' -> ')}), ${Math.round(cycle.amountPreservationRate * 100)}% of funds preserved over ${cycle.durationHours}h`,
          entities: cycle.accounts,
        })
      }
    }
  }

  // 2. Smurfing / structuring
  const smurfing = await runDetector(
    'smurfing',
    (c) => new SmurfingDetector(c).detectSmurfing(),
    falkor,
  )
  if (smurfing) {
    algorithmsRun.push('smurfing')
    for (const pattern of smurfing.fanInStructuring) {
      if (
        ownsInvolved(
          pattern.targetAccountId,
          pattern.targetAccountNumber,
          pattern.sourceAccountIds,
        )
      ) {
        signals.push({
          type: 'structuring_fan_in',
          severity: 'medium',
          detail: `Structuring fan-in on ${pattern.targetAccountNumber || pattern.targetAccountId}: ${pattern.transactionCount} deposits totaling ${pattern.totalAmount} below the reporting threshold`,
          entities: [pattern.targetAccountNumber || pattern.targetAccountId],
        })
      }
    }
    for (const pattern of smurfing.fanOutStructuring) {
      if (ownsInvolved(pattern.sourceAccountId, pattern.targetAccountIds)) {
        signals.push({
          type: 'structuring_fan_out',
          severity: 'medium',
          detail: `Structuring fan-out from ${pattern.sourceAccountId} to ${pattern.targetAccountIds.length} target accounts (${pattern.totalAmount} total)`,
          entities: [pattern.sourceAccountNumber || pattern.sourceAccountId],
        })
      }
    }
  }

  // 3. Scatter-gather layering
  const scatter = await runDetector(
    'scatter_gather',
    (c) => new ScatterGatherDetector(c).detectScatterGather(),
    falkor,
  )
  if (scatter) {
    algorithmsRun.push('scatter_gather')
    for (const pattern of scatter.patterns) {
      if (
        ownsInvolved(
          pattern.sourceAccountId,
          pattern.destinationAccountId,
          pattern.muleAccountIds,
        )
      ) {
        signals.push({
          type: 'scatter_gather_layering',
          severity: 'medium',
          detail: `Layering path ${pattern.sourceAccountId} -> ${pattern.muleAccountIds.length} mule(s) -> ${pattern.destinationAccountId}`,
          entities: [pattern.sourceAccountId, pattern.destinationAccountId],
        })
      }
    }
  }

  // 4. Entity resolution — synthetic identity clusters
  const resolution = await runDetector(
    'entity_resolution',
    (c) => new EntityResolutionDetector(c).resolveEntities(),
    falkor,
  )
  if (resolution) {
    algorithmsRun.push('entity_resolution')
    const selfMatch = (identifierValue: string) =>
      identifierValues.includes(identifierValue.toLowerCase())
    for (const cluster of resolution.clusters) {
      const inCluster =
        (subject.personId &&
          cluster.memberPersonIds.includes(subject.personId)) ||
        normalizedName(cluster.masterPersonName) ===
          normalizedName(subject.personName)
      if (inCluster) {
        signals.push({
          type: 'entity_resolution_cluster',
          severity: 'medium',
          detail: `Subject clusters with ${cluster.memberPersonIds.length} other identities (confidence ${(cluster.confidence * 100).toFixed(0)}%) sharing ${cluster.sharedIdentifiers.map((i) => i.type).join(', ')}`,
          entities: cluster.memberPersonIds,
        })
      }
    }
    for (const match of resolution.pairwiseMatches) {
      const sharedValue = match.sharedIdentifiers[0]?.value
      if (!sharedValue || !selfMatch(sharedValue)) continue
      // Skip self-pairs: duplicate Person nodes of the same subject (e.g.
      // from repeated verifications) resolve pairwise against each other.
      // The cluster signal above already covers that duplication.
      const nameA = normalizedName(match.personAName || '')
      const nameB = normalizedName(match.personBName || '')
      if (nameA && nameA === nameB) continue
      signals.push({
        type: 'shared_identifier',
        severity: 'low',
        detail: `Shared identifier ${match.sharedIdentifiers[0].type}=...${sharedValue.slice(-4)} with ${match.personAName || match.personBName} (similarity ${(match.similarityScore * 100).toFixed(0)}%)`,
        entities: [match.personAName, match.personBName].filter(Boolean),
      })
    }
  }

  // 5. Centrality — money-mule hub exposure on owned accounts
  const centrality = await runDetector(
    'centrality_pagerank',
    (c) => new CentralityDetector(c).computeCentrality(),
    falkor,
  )
  if (centrality) {
    algorithmsRun.push('centrality_pagerank')
    for (const node of centrality.pageRank) {
      if (ownsInvolved(node.accountId, node.accountNumber)) {
        const role = centrality.flowHubs.find(
          (h) => h.accountId === node.accountId,
        )
        signals.push({
          type: 'high_centrality_account',
          severity: node.score >= 0.15 ? 'high' : 'medium',
          detail: `Subject-owned account ${node.accountNumber || node.accountId} ranks #${node.rank} by PageRank (${node.score.toFixed(3)})${role ? ` — hub role ${role.role}` : ''}`,
          entities: [node.accountId],
        })
      }
    }
  }

  // 6. Sanctions / risk tracing
  const tracing = await runDetector(
    'risk_trace',
    (c) => new RiskTracingDetector(c).traceSanctionExposures(),
    falkor,
  )
  if (tracing) {
    algorithmsRun.push('risk_trace')
    for (const exposure of tracing.exposures) {
      if (ownsInvolved(exposure.targetAccountId, exposure.path)) {
        signals.push({
          type: 'sanctions_exposure',
          severity: 'high',
          detail: `Account routes to sanctions exposure via ${exposure.sanctionedAccountId || 'a sanctioned node'} (${exposure.hopDistance} hops, risk ${(exposure.decayedRiskScore * 100).toFixed(0)}%)`,
          entities: [
            exposure.sanctionedAccountId,
            exposure.targetAccountId,
          ].filter(Boolean),
        })
      }
    }
  }

  // 7. DPRK IT-worker screening (July 2026 joint advisory / UNSCR 2397)
  const nkScreening = await runDetector(
    'nk_worker',
    (c) => new NkWorkerDetector(c).screenNkIndicators(),
    falkor,
  )
  if (nkScreening) {
    algorithmsRun.push('nk_worker')
    const subjectInResults = (personId: string, personName?: string) =>
      personId === subject.personId ||
      Boolean(
        personName &&
        normalizedName(personName) &&
        normalizedName(personName) === normalizedName(subject.personName),
      )
    for (const suspect of nkScreening.suspectedNkWorkers) {
      if (!subjectInResults(suspect.personId, suspect.personName)) continue
      const topCodes = suspect.indicators
        .slice(0, 3)
        .map((i) => i.code)
        .join(', ')
      signals.push({
        type: 'dprk_it_worker_indicator',
        severity: suspect.riskScore >= 45 ? 'high' : 'medium',
        detail: `Screened as suspected DPRK government-affiliated IT worker (${suspect.riskScore}/100, ${suspect.indicators.length} indicators${topCodes ? `: ${topCodes}` : ''}) per the July 2026 joint advisory; UNSCR 2397/OFAC obligations apply`,
        entities: [
          suspect.personName,
          ...suspect.indicators.map((i) => i.code),
        ],
      })
    }
    for (const infra of nkScreening.sharedInfrastructure) {
      const touchesSubject =
        (subject.personId &&
          infra.linkedPersonIds.includes(subject.personId)) ||
        identifierValues.some((v) => v === infra.value.toLowerCase())
      if (!touchesSubject) continue
      signals.push({
        type: 'dprk_shared_infrastructure',
        severity: infra.identifierType === 'ip' ? 'high' : 'medium',
        detail: `Subject operates on shared ${infra.identifierType} infrastructure (${infra.value}) with ${infra.linkedPersonNames.join(', ')} — laptop-farm/proxy pattern flagged by DPRK IT-worker screening`,
        entities: infra.linkedPersonNames,
      })
    }
    for (const flow of nkScreening.frontCompanyRemittances) {
      const isSubject =
        subjectInResults(flow.subjectPersonId, flow.subjectPersonName) ||
        ownsInvolved(flow.fromAccountId)
      if (!isSubject) continue
      signals.push({
        type: 'dprk_front_company_remittance',
        severity: 'high',
        detail: `Funds move from the subject's account (${flow.fromAccountId}) to DPRK front company conduit ${flow.toAccountId} (matched: ${flow.matchedToken}) — UNSCR 2397/OFAC exposure`,
        entities: [flow.toAccountId],
      })
    }
  }

  if (algorithmsRun.length && !hasData()) {
    // All detectors ran cleanly with zero typology involvement for the subject.
    signals.push({
      type: 'no_active_typologies',
      severity: 'informational',
      detail: `All graph detectors (${algorithmsRun.join(', ')}) found no typology involving the subject's accounts`,
      entities: [subject.personName],
    })
  }
  if (!subject.submittedIdentifiers.length) {
    signals.push({
      type: 'identity_incomplete',
      severity: 'informational',
      detail: 'No contact/document identifiers captured for this subject',
      entities: [subject.personName],
    })
  }

  // Collapse identical signals — duplicate Person nodes (repeated
  // verifications of the same subject) can emit the same finding several
  // times, which would double-count it in the risk score.
  const seenSignals = new Set<string>()
  const dedupedSignals = signals.filter((s) => {
    const key = `${s.type}|${s.detail}`
    if (seenSignals.has(key)) return false
    seenSignals.add(key)
    return true
  })
  signals = dedupedSignals

  let score = 0
  for (const signal of signals) score += signalWeight(signal.severity)
  score = Math.min(100, score)

  const typologies = signals.filter(
    (s) => s.severity === 'high' || s.severity === 'medium',
  )
  const documentNumber = subject.submittedIdentifiers.find(
    (i) => i.type === 'documentNumber',
  )?.value
  return {
    subject: subject.personName,
    ...(documentNumber ? { documentNumber } : {}),
    riskScore: score,
    level: levelForScore(score),
    summary:
      typologies.length === 0
        ? `Graph-native AML analytics (${algorithmsRun.join(', ')}) produced no typology involvement for ${subject.personName}.`
        : `Graph-native AML analytics flagged ${typologies.length} typolog${typologies.length === 1 ? 'y' : 'ies'} for ${subject.personName}. Review the signals and consider escalation.`,
    algorithmsRun,
    signals,
  }
}
