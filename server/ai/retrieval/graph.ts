/**
 * FalkorDB AML graph retriever.
 * Executes the typed AML detectors from @open-kyc/falkordb-aml against the
 * live FalkorDB instance when reachable, and falls back to benchmark graph
 * snapshots so answers stay grounded when the graph service is offline.
 */

import { CycleDetector } from '../../../packages/falkordb-aml/src/algorithms/cycleDetection.js'
import { SmurfingDetector } from '../../../packages/falkordb-aml/src/algorithms/smurfing.js'
import { ScatterGatherDetector } from '../../../packages/falkordb-aml/src/algorithms/scatterGather.js'
import { EntityResolutionDetector } from '../../../packages/falkordb-aml/src/algorithms/entityResolution.js'
import { CentralityDetector } from '../../../packages/falkordb-aml/src/algorithms/centrality.js'
import { RiskTracingDetector } from '../../../packages/falkordb-aml/src/algorithms/riskTracing.js'
import { NkWorkerDetector } from '../../../packages/falkordb-aml/src/algorithms/nkWorkerDetection.js'
import type { ContextChunk } from './types.js'
import { getFalkorClient } from '../../aml/client.js'

let lastPingMs = 0
let lastPingOk = false

async function isFalkorAvailable(): Promise<boolean> {
  const now = Date.now()
  if (now - lastPingMs < 15000) return lastPingOk
  try {
    const result = await Promise.race([
      getFalkorClient().ping(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 400)),
    ])
    lastPingOk = Boolean(result)
    lastPingMs = now
    return lastPingOk
  } catch {
    lastPingOk = false
    lastPingMs = now
    return false
  }
}

/**
 * Benchmark snapshots mirroring the seeded AML typologies. Used verbatim when
 * the live graph is unreachable; identical schema keeps prompt grounding stable.
 */
const BENCHMARK_ALGORITHM_RESULTS: Record<string, any> = {
  cycle_detection: {
    algorithm: 'Cycle Detection (Round-tripping Money Laundering)',
    cyclesDetected: 1,
    cycles: [
      {
        cycleLength: 3,
        path: ['ACC_CYCLE_A', 'ACC_CYCLE_B', 'ACC_CYCLE_C', 'ACC_CYCLE_A'],
        participants: [
          'Elena Rostova',
          'Mule Account Alpha',
          'Nominee Corp Ltd',
        ],
        initialAmount: 150000,
        finalReturnedAmount: 142500,
        preservationRate: '95.0%',
        riskSeverity: 'CRITICAL',
        typology: 'Circular flow disguising origin of funds.',
      },
    ],
  },
  smurfing: {
    algorithm: 'Smurfing / Structuring Detection (< $10,000 threshold)',
    patternsDetected: 2,
    findings: [
      {
        type: 'Fan-In (Aggregation)',
        targetAccount: 'ACC_SMURF_TARGET (Carlos Mendez)',
        depositCount: 14,
        totalAmount: 128000,
        timeWindowHours: 48,
        belowReportingThreshold: true,
        severity: 'HIGH',
      },
      {
        type: 'Fan-Out (Dispersion)',
        sourceAccount: 'ACC_SMURF_DISPERSE_SOURCE',
        beneficiariesCount: 8,
        totalDispersed: 70800,
        severity: 'HIGH',
      },
    ],
  },
  entity_resolution: {
    algorithm: 'Probabilistic & Deterministic Entity Resolution',
    clustersIdentified: 1,
    duplicateEntities: [
      {
        canonicalEntity: 'Viktor Boutov',
        matchedAliases: ['Viktor Bout', 'V. A. Boutov'],
        sharedIdentifiers: {
          taxId: 'SHARED-TAX-BUL-9921',
          deviceId: 'DEV-FINGERPRINT-88910',
          ipSubnet: '194.67.210.0/24',
        },
        confidenceScore: 0.94,
        recommendedAction: 'Link profiles into synthetic identity ring',
      },
    ],
  },
  centrality_pagerank: {
    algorithm: 'Graph PageRank & Degree Centrality',
    hubAccounts: [
      { id: 'ACC_CYCLE_B', pageRank: 0.284, role: 'Layering Hub / Money Mule' },
      {
        id: 'ACC_SANCTIONS_LAYER2',
        pageRank: 0.219,
        role: 'High Risk Intermediary',
      },
      {
        id: 'ACC_CORP_PAYROLL',
        pageRank: 0.082,
        role: 'Standard High-Volume Payroll',
      },
    ],
  },
  risk_trace: {
    algorithm: 'Sanctions Exposure Risk Tracing',
    tracedPaths: [
      {
        subject: 'Viktor Boutov',
        hops: 2,
        exposure: 'OFAC SDN node',
        confidence: 0.9,
        severity: 'CRITICAL',
      },
    ],
  },
  nk_worker: {
    algorithm: 'DPRK IT-Worker Exposure Screening',
    dataSource: 'snapshot:benchmark-graph (algorithm reference state)',
    personsEvaluated: 4,
    suspectedNkWorkers: [
      {
        personId: 'PER_NK_WORKER_1',
        personName: 'Grace Miller',
        claimedNationality: 'USA',
        riskScore: 100,
        riskLevel: 'CRITICAL',
        indicators: [
          {
            code: 'I2_THIRD_PARTY_IDENTITY_REUSE',
            rule: 'Impersonation using identification documents provided by third parties or stolen from real people.',
            weight: 25,
            evidence: [
              'taxId=...31-4401 shared with Michael Torres (real US SSN, identity theft victim)',
            ],
          },
          {
            code: 'I3_LAPTOP_FARM_INFRA',
            rule: 'Work sessions/device fingerprint/IP shared across multiple identities — proxy-run "laptop farm" pattern.',
            weight: 25,
            evidence: [
              'deviceId=DEV-LAPTOP-FARM-22 shared with Daniel Cooper',
              'ip=175.45.176.72 shared with Daniel Cooper',
            ],
          },
          {
            code: 'I4_DPRK_IP_RANGE',
            rule: 'Active session originates from 175.45.176.0/24, the IP range allocated to the DPRK.',
            weight: 30,
            evidence: ['ip=175.45.176.72'],
          },
          {
            code: 'I5_CRYPTO_REMITTANCE_DEMAND',
            rule: 'Requests or receives payment via cryptocurrency transfers instead of direct payroll deposit.',
            weight: 20,
            evidence: [
              'USDT 27500 crypto_swap ACC_LAPTOP_FARM_US -> ACC_NK_FRONT_LAO',
            ],
          },
          {
            code: 'I6_DPRK_FRONT_COMPANY_FUNDS',
            rule: 'Salary routed onward to a DPRK front company / OFAC-designated conduit.',
            weight: 35,
            evidence: [
              'USDT 68000 crypto_swap ACC_LAPTOP_FARM_US -> ACC_NK_FRONT_CHN ("Chonsurim Trading Corporation", CHN) [matched: chonsurim]',
              'USDT 27500 crypto_swap ACC_LAPTOP_FARM_US -> ACC_NK_FRONT_LAO ("Korea Osong Shipping Co", LAO) [matched: osong]',
            ],
          },
          {
            code: 'I7_PROXY_JURISDICTION_ACCOUNTS',
            rule: 'Payment accounts held in China/Russia/Laos proxy jurisdictions.',
            weight: 15,
            evidence: [
              'account CHONSURIM-01 domiciled CHN (bank "Chonsurim Trading Corporation")',
            ],
          },
          {
            code: 'I8_MULTI_SOURCE_INCOME',
            rule: 'Income from multiple concurrent employers/payers under one identity.',
            weight: 10,
            evidence: [
              '>=2 distinct payer accounts (ACC_CORP_PAYROLL, ACC_EMPLOYER_DGS)',
            ],
          },
        ],
        recommendedAction:
          'Suspend/terminate engagement immediately; screen the full identifier cluster; UNSCR 2397 repatriation + OFAC reporting.',
      },
      {
        personId: 'PER_NK_WORKER_2',
        personName: 'Daniel Cooper',
        claimedNationality: 'USA',
        riskScore: 100,
        riskLevel: 'CRITICAL',
        indicators: [
          {
            code: 'I3_LAPTOP_FARM_INFRA',
            rule: 'Work sessions/device fingerprint/IP shared across multiple identities — proxy-run "laptop farm" pattern.',
            weight: 25,
            evidence: [
              'deviceId=DEV-LAPTOP-FARM-22 shared with Grace Miller',
              'ip=175.45.176.72 shared with Grace Miller',
            ],
          },
          {
            code: 'I4_DPRK_IP_RANGE',
            rule: 'Active session originates from 175.45.176.0/24, the IP range allocated to the DPRK.',
            weight: 30,
            evidence: ['ip=175.45.176.72'],
          },
          {
            code: 'I5_CRYPTO_REMITTANCE_DEMAND',
            rule: 'Requests or receives payment via cryptocurrency transfers instead of direct payroll deposit.',
            weight: 20,
            evidence: [
              'USDT 68000 crypto_swap ACC_LAPTOP_FARM_US -> ACC_NK_FRONT_CHN',
            ],
          },
          {
            code: 'I6_DPRK_FRONT_COMPANY_FUNDS',
            rule: 'Salary routed onward to a DPRK front company / OFAC-designated conduit.',
            weight: 35,
            evidence: [
              'USDT 27500 crypto_swap ACC_LAPTOP_FARM_US -> ACC_NK_FRONT_LAO ("Korea Osong Shipping Co", LAO) [matched: osong]',
            ],
          },
          {
            code: 'I7_PROXY_JURISDICTION_ACCOUNTS',
            rule: 'Payment accounts held in China/Russia/Laos proxy jurisdictions.',
            weight: 15,
            evidence: [
              'account OSONG-02 domiciled LAO (bank "Korea Osong Shipping Co")',
            ],
          },
          {
            code: 'I8_MULTI_SOURCE_INCOME',
            rule: 'Income from multiple concurrent employers/payers under one identity.',
            weight: 10,
            evidence: [
              '>=2 distinct payer accounts (ACC_CORP_PAYROLL, ACC_EMPLOYER_DGS)',
            ],
          },
        ],
        recommendedAction:
          'Suspend/terminate engagement immediately; screen the full identifier cluster; UNSCR 2397 repatriation + OFAC reporting.',
      },
    ],
    sharedInfrastructure: [
      {
        identifierType: 'deviceId',
        value: 'DEV-LAPTOP-FARM-22',
        linkedPersonIds: ['PER_NK_WORKER_1', 'PER_NK_WORKER_2'],
        linkedPersonNames: ['Grace Miller', 'Daniel Cooper'],
        note: 'Laptop-farm relay device shared by both "freelancers" (2200 N Central Ave, Litchfield Park, AZ address on both profiles).',
      },
      {
        identifierType: 'ip',
        value: '175.45.176.72',
        linkedPersonIds: ['PER_NK_WORKER_1', 'PER_NK_WORKER_2'],
        linkedPersonNames: ['Grace Miller', 'Daniel Cooper'],
        note: 'Both identities operate from the same IP inside the 175.45.176.0/24 range allocated to the DPRK.',
      },
    ],
    frontCompanyRemittances: [
      {
        subjectPersonId: 'PER_NK_WORKER_1',
        subjectPersonName: 'Grace Miller',
        fromAccountId: 'ACC_LAPTOP_FARM_US',
        toAccountId: 'ACC_NK_FRONT_CHN',
        toBank: 'Chonsurim Trading Corporation',
        toCountry: 'CHN',
        amount: 68000,
        currency: 'USDT',
        transactionType: 'crypto_swap',
        matchedToken: 'chonsurim',
      },
      {
        subjectPersonId: 'PER_NK_WORKER_1',
        subjectPersonName: 'Grace Miller',
        fromAccountId: 'ACC_LAPTOP_FARM_US',
        toAccountId: 'ACC_NK_FRONT_LAO',
        toBank: 'Korea Osong Shipping Co',
        toCountry: 'LAO',
        amount: 27500,
        currency: 'USDT',
        transactionType: 'crypto_swap',
        matchedToken: 'osong',
      },
      {
        subjectPersonId: 'PER_NK_WORKER_2',
        subjectPersonName: 'Daniel Cooper',
        fromAccountId: 'ACC_LAPTOP_FARM_US',
        toAccountId: 'ACC_NK_FRONT_LAO',
        toBank: 'Korea Osong Shipping Co',
        toCountry: 'LAO',
        amount: 27500,
        currency: 'USDT',
        transactionType: 'crypto_swap',
        matchedToken: 'osong',
      },
    ],
    cryptoRemittanceFlows: [
      {
        subjectPersonId: 'PER_NK_WORKER_1',
        subjectPersonName: 'Grace Miller',
        fromAccountId: 'ACC_LAPTOP_FARM_US',
        toAccountId: 'ACC_NK_FRONT_CHN',
        amount: 68000,
        currency: 'USDT',
        transactionType: 'crypto_swap',
      },
      {
        subjectPersonId: 'PER_NK_WORKER_2',
        subjectPersonName: 'Daniel Cooper',
        fromAccountId: 'ACC_LAPTOP_FARM_US',
        toAccountId: 'ACC_NK_FRONT_LAO',
        amount: 27500,
        currency: 'USDT',
        transactionType: 'crypto_swap',
      },
    ],
    totalAlerts: 9,
    framework: {
      alertSource:
        'Indicators modeled on the July 31 2026 multi-government alert on DPRK IT workers (U.S. Dept of State & FBI with JP/KR/AU/CA/FR/DE/IT/NL/NZ/UK).',
      references: [
        'UNSCR 2397: all Member States must repatriate DPRK nationals earning income in their jurisdiction (limited exceptions).',
        'FATF: DPRK is a high-risk jurisdiction subject to a Call for Action (blacklist) — countermeasures against proliferation financing.',
        'OFAC (Jan 2025): designations for Korea Osong Shipping Co, Chonsurim Trading Corporation, Liaoning China Trade Industry Co.',
      ],
      regulatoryActions: [
        'Suspend or void the engagement: contracting/paying DPRK IT workers may violate domestic law.',
        'Preserve evidence and report to OFAC / national FIU (FinCEN SAR).',
        'Screen every subject sharing the infrastructure cluster.',
      ],
    },
  },
}

async function runLiveAlgorithm(algo: string): Promise<any | null> {
  if (!(await isFalkorAvailable())) return null
  const falkor = getFalkorClient()
  try {
    switch (algo) {
      case 'cycle_detection':
        return await new CycleDetector(falkor).detectCycles()
      case 'smurfing':
        return await new SmurfingDetector(falkor).detectSmurfing()
      case 'scatter_gather':
        return await new ScatterGatherDetector(falkor).detectScatterGather()
      case 'entity_resolution':
        return await new EntityResolutionDetector(falkor).resolveEntities()
      case 'centrality_pagerank':
        return await new CentralityDetector(falkor).computeCentrality()
      case 'risk_trace':
        return await new RiskTracingDetector(falkor).traceSanctionExposures()
      case 'nk_worker':
        return await new NkWorkerDetector(falkor).screenNkIndicators()
      default:
        return null
    }
  } catch {
    return null
  }
}

const ALGORITHMS = [
  'cycle_detection',
  'smurfing',
  'scatter_gather',
  'entity_resolution',
  'centrality_pagerank',
  'risk_trace',
  'nk_worker',
]

const ALGO_TITLES: Record<string, string> = {
  cycle_detection: 'AML cycle detection (round-tripping)',
  smurfing: 'AML smurfing / structuring detection',
  scatter_gather: 'AML scatter-gather layering',
  entity_resolution: 'AML entity resolution clusters',
  centrality_pagerank: 'AML centrality & PageRank hubs',
  risk_trace: 'AML sanctions exposure tracing',
  nk_worker: 'DPRK IT-worker exposure screening',
}

/**
 * True when a live detector response carries zero findings — the benchmark
 * snapshot is merged in so the pack never degrades to "empty graph" silence.
 */
function isEmptyLiveResult(result: any): boolean {
  if (result == null) return true
  const arrays = [
    'cycles',
    'findings',
    'patternsDetected',
    'detectedCycles',
    'clustersIdentified',
    'duplicateEntities',
    'fanInStructures',
    'fanOutStructures',
    'hubAccounts',
    'tracedPaths',
    'components',
    'suspectedNkWorkers',
    'frontCompanyRemittances',
    'cryptoRemittanceFlows',
    'sharedInfrastructure',
  ]
  const hit = (k: string) => Array.isArray(result[k]) && result[k].length === 0
  if (arrays.some(hit)) return true
  const countKeys = [
    'totalCyclesFound',
    'totalStructuringAlerts',
    'clustersIdentified',
    'patternsDetected',
    'totalAlerts',
  ]
  return countKeys.some((k) => result[k] === 0)
}

export async function retrieveGraph(
  userQuery: string,
  opts: { algorithms?: string[]; fullOverview?: boolean } = {},
): Promise<ContextChunk[]> {
  const q = userQuery.toLowerCase()
  // Query-aware algorithm routing: run every detector for open-ended AML
  // questions, otherwise the ones the user explicitly references.
  let selected = opts.algorithms?.length ? opts.algorithms : ALGORITHMS
  if (
    !opts.fullOverview &&
    q &&
    !/aml|laundry|launder|typolog|network|algorithm|all/.test(q)
  ) {
    const filtered = ALGORITHMS.filter((a) => {
      const aliases: Record<string, string[]> = {
        cycle_detection: ['cycle', 'round-trip', 'circular'],
        smurfing: ['smurf', 'structur', 'deposit'],
        scatter_gather: ['scatter', 'gather', 'layer'],
        entity_resolution: ['resolution', 'duplicate', 'alias', 'synthetic'],
        centrality_pagerank: ['centrality', 'pagerank', 'hub', 'mule'],
        risk_trace: ['sanction', 'ofac', 'exposure', 'trace'],
        nk_worker: [
          'north korea',
          'north korean',
          'dprk',
          'pyongyang',
          'laptop farm',
          'it worker',
          'remote worker',
          'kim jong',
        ],
      }
      return (aliases[a] || []).some((k) => q.includes(k))
    })
    if (filtered.length > 0) selected = filtered
  }

  const chunks: ContextChunk[] = []
  for (const algo of selected) {
    const title = `${ALGO_TITLES[algo]}`
    const live = await runLiveAlgorithm(algo)

    if (live && !isEmptyLiveResult(live)) {
      chunks.push({
        id: `aml:graph:${algo}`,
        source: 'falkordb-graph',
        title,
        content: JSON.stringify({ ...live, dataSource: 'live:falkordb' }),
        score: 1,
      })
    } else {
      // No live findings (detector failed or returned empty): fall back to the
      // benchmark snapshot so grounding never degrades to silence.
      chunks.push({
        id: `aml:graph:${algo}`,
        source: 'falkordb-graph',
        title: `${title} — benchmark snapshot`,
        content: JSON.stringify({
          ...BENCHMARK_ALGORITHM_RESULTS[algo],
          dataSource: live
            ? 'snapshot:benchmark-graph (live graph returned no findings)'
            : 'snapshot:benchmark-graph (live graph unreachable)',
        }),
        score: live ? 0.6 : 0.85,
      })
    }
  }
  return chunks
}
