import { FalkorDBClient } from '../client.js'
import type {
  IdentifierType,
  NkWorkerIndicator,
  NkWorkerResult,
  NkWorkerSubject,
  RiskLevel,
} from '../types.js'

/**
 * DPRK IT-worker exposure screening.
 *
 * Scores every :Person node against the modus operandi documented in the
 * multinational advisory of July 31 2026 (U.S. Dept of State & FBI with JP/KR/
 * AU/CA/FR/DE/IT/NL/NZ/UK partners) regarding North Korean IT workers that
 * generate revenue for the DPRK government and its weapons programs:
 *
 *  - Falsified nationality / identity documents impersonating third parties.
 *  - Third-party proxy infrastructure ("laptop farms"): devices and IP
 *    fingerprints shared across several "employees"
 *  - Payments routed through third-party bank accounts and cryptocurrency
 *    (USDT / OTC desks) instead of direct payroll deposit.
 *  - Salaries converted to state revenue by DPRK front companies (e.g. Korea
 *    Osong Shipping Co, Chonsurim Trading Corporation) — UNSCR 2397 / OFAC
 *    sanctions exposure.
 */

export interface NkWorkerDetectorOptions {
  /** Score at or above which a person is reported as a suspected DPRK worker. */
  reportingThreshold?: number
}

const NK_IDENTITY_TOKENS = [
  'north korea',
  'north korean',
  'dprk',
  "democratic people's republic",
  '(korea, north)',
  'korea (north)',
]

/**
 * Names of DPRK revenue fronts designated by OFAC (January 2025) plus generic
 * DPRK markers that may appear in account/counterparty metadata.
 */
const NK_FRONT_NAME_TOKENS = [
  'osong',
  'chonsurim',
  'liaoning',
  'pyongyang',
  'north korea',
  'dprk',
]

/** Countries where DPRK worker cells typically operate proxy accounts. */
const PROXY_JURISDICTIONS = new Set(['PRK', 'CHN', 'RUS', 'LAO', 'VNM'])

/** Actual DPRK-nationally allocated IPv4 block (175.45.176.0/24). */
const DPRK_IP_PREFIX = '175.45.176.'

const WEIGHTS = {
  dprkIdentityClaim: 40,
  thirdPartyIdentityReuse: 25,
  dprkNeighborhoodIp: 30,
  laptopFarmInfra: 25,
  dprkFrontFunds: 35,
  cryptoRemittance: 20,
  proxyJurisdictionAccounts: 15,
  multiSourceIncome: 10,
} as const

interface PersonRow {
  id: string
  name?: string
  nationality?: string
}

interface IdentifierRow {
  personId: string
  type: string
  val: string
}

interface AccountRow {
  id: string
  accountNumber?: string
  bank?: string
  country?: string
  type?: string
  isSanctioned?: boolean
}

interface TransactionRow {
  srcId: string
  dstId: string
  amount?: number
  currency?: string
  type?: string
}

function actionForScore(score: number): string {
  if (score >= 75) {
    return 'Suspend/terminate engagement immediately; screen the full identifier cluster for the operative cell; prepare sanctions escalation under UNSCR 2397 & OFAC guidance.'
  }
  if (score >= 45) {
    return 'Escalate to sanctions compliance; verify identity via in-person meeting; suspend payment channels pending review.'
  }
  if (score >= 20) {
    return 'Enhanced due diligence: in-person video verification, employer-side IP/device audit, monitor remittance destinations.'
  }
  return 'Monitor; no DPRK indicators beyond routine review.'
}

function riskLevelForScore(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL'
  if (score >= 45) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  if (score >= 8) return 'LOW'
  return 'CLEAN'
}

function normalizeNationality(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z' (),]/g, '')
}

function isDprkIdentityClaim(nationality?: string): boolean {
  const norm = normalizeNationality(nationality)
  if (!norm) return false
  return NK_IDENTITY_TOKENS.some((token) => norm.includes(token))
}

function matchedFrontToken(value?: string): string | null {
  const hay = String(value ?? '').toLowerCase()
  if (!hay) return null
  return NK_FRONT_NAME_TOKENS.find((token) => hay.includes(token)) ?? null
}

export class NkWorkerDetector {
  private client: FalkorDBClient

  constructor(client: FalkorDBClient) {
    this.client = client
  }

  /**
   * Runs the full DPRK IT-worker screening sweep over every person in the
   * graph and returns scored subjects plus the supporting network evidence.
   */
  async screenNkIndicators(
    options: NkWorkerDetectorOptions = {},
  ): Promise<NkWorkerResult> {
    const reportingThreshold = options.reportingThreshold ?? 30

    const [personRes, identifierRes, ownershipRes, accountRes, txRes] =
      await Promise.all([
        this.client.query<PersonRow>(
          'MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.nationality AS nationality',
        ),
        this.client.query<IdentifierRow>(
          'MATCH (p:Person)-[:HAS_IDENTIFIER]->(i:Identifier) RETURN p.id AS personId, i.type AS type, i.val AS val',
        ),
        this.client.query<{ personId: string; accountId: string }>(
          'MATCH (p:Person)-[:OWNS]->(a:Account) RETURN p.id AS personId, a.id AS accountId',
        ),
        this.client.query<AccountRow>(
          `MATCH (a:Account) RETURN a.id AS id, a.accountNumber AS accountNumber,
           a.bank AS bank, a.country AS country, a.type AS type,
           a.isSanctioned AS isSanctioned`,
        ),
        this.client.query<TransactionRow>(
          `MATCH (src:Account)-[t:TRANSFERRED]->(dst:Account) RETURN src.id AS srcId,
           dst.id AS dstId, t.amount AS amount, t.currency AS currency, t.type AS type`,
        ),
      ])

    const people = personRes.data
    const personsByName = new Map(people.map((p) => [p.id, p]))
    const txnRows: TransactionRow[] = txRes.data
    const accountMeta = new Map(accountRes.data.map((a) => [a.id, a]))

    const ownedBy = new Map<string, Set<string>>()
    for (const row of ownershipRes.data) {
      if (!ownedBy.has(row.accountId)) ownedBy.set(row.accountId, new Set())
      ownedBy.get(row.accountId)!.add(row.personId)
    }
    const accountsOf = new Map<string, Set<string>>()
    for (const row of ownershipRes.data) {
      if (!accountsOf.has(row.personId)) accountsOf.set(row.personId, new Set())
      accountsOf.get(row.personId)!.add(row.accountId)
    }

    // Identifiers by person; keep provenance (type + value together)
    const identifiersByPerson = new Map<
      string,
      Map<IdentifierType, Set<string>>
    >()
    for (const row of identifierRes.data) {
      const type = row.type as IdentifierType
      if (!type || !row.val) continue
      if (!identifiersByPerson.has(row.personId))
        identifiersByPerson.set(row.personId, new Map())
      const bag = identifiersByPerson.get(row.personId)!
      if (!bag.has(type)) bag.set(type, new Set())
      bag.get(type)!.add(row.val)
    }

    // Identifier sharing index: type -> value -> person ids
    const infraIndex = new Map<string, Map<string, Set<string>>>()
    for (const [personId, bag] of identifiersByPerson) {
      for (const [type, values] of bag) {
        if (!infraIndex.has(type)) infraIndex.set(type, new Map())
        const byValue = infraIndex.get(type)!
        for (const val of values) {
          if (!byValue.has(val)) byValue.set(val, new Set())
          byValue.get(val)!.add(personId)
        }
      }
    }

    // Deterministic identity documents/tax IDs reused from other profiles
    const reusedIdentityEvidence = new Map<string, string[]>()
    for (const type of ['taxId', 'documentNumber'] as IdentifierType[]) {
      const byValue = infraIndex.get(type)
      if (!byValue) continue
      for (const [val, personIds] of byValue) {
        if (personIds.size < 2) continue
        for (const personId of personIds) {
          if (!reusedIdentityEvidence.has(personId))
            reusedIdentityEvidence.set(personId, [])
          reusedIdentityEvidence
            .get(personId)!
            .push(
              `${type}=...${val.slice(-6)} shared with ${personIds.size - 1} other profile(s)`,
            )
        }
      }
    }

    // Shared device/IP infrastructure ("laptop farms")
    const sharedInfrastructure: NkWorkerResult['sharedInfrastructure'] = []
    for (const type of ['deviceId', 'ip'] as IdentifierType[]) {
      const byValue = infraIndex.get(type)
      if (!byValue) continue
      for (const [val, personIds] of byValue) {
        if (personIds.size < 2) continue
        const linked = Array.from(personIds)
        sharedInfrastructure.push({
          identifierType: type,
          value: val,
          linkedPersonIds: linked,
          linkedPersonNames: linked.map(
            (id) => personsByName.get(id)?.name || id,
          ),
          note:
            type === 'deviceId'
              ? 'Multiple distinct identities operating from the same device fingerprint — consistent with proxy-run "laptop farms".'
              : 'Multiple distinct identities observed from the same IP address — consistent with remote access via third-party proxy infrastructure.',
        })
      }
    }

    const subjects: NkWorkerSubject[] = []
    const frontCompanyRemittances: NkWorkerResult['frontCompanyRemittances'] =
      []
    const cryptoRemittanceFlows: NkWorkerResult['cryptoRemittanceFlows'] = []

    for (const person of people) {
      const indicators: NkWorkerIndicator[] = []
      const ownedIds = Array.from(accountsOf.get(person.id) ?? [])
      const bag =
        identifiersByPerson.get(person.id) ??
        new Map<IdentifierType, Set<string>>()

      // I1 — identity claims DPRK nationality
      if (isDprkIdentityClaim(person.nationality)) {
        indicators.push({
          code: 'I1_DPRK_IDENTITY_CLAIM',
          rule: 'Registered nationality files as North Korean / DPRK.',
          weight: WEIGHTS.dprkIdentityClaim,
          evidence: [`nationality="${person.nationality}"`],
        })
      }

      // I2 — identification documents/tax IDs borrowed from a third party
      const reusedEvidence = reusedIdentityEvidence.get(person.id) ?? []
      if (reusedEvidence.length > 0) {
        indicators.push({
          code: 'I2_THIRD_PARTY_IDENTITY_REUSE',
          rule: 'Impersonation using identification documents provided by third parties or stolen from real people.',
          weight: WEIGHTS.thirdPartyIdentityReuse,
          evidence: reusedEvidence,
        })
      }

      // I3 — shared device/IP laptop-farm infrastructure
      const farmEvidence: string[] = []
      for (const type of ['deviceId', 'ip'] as IdentifierType[]) {
        for (const val of bag.get(type) ?? []) {
          const sharers = infraIndex.get(type)?.get(val)
          if (sharers && sharers.size >= 2) {
            const names = Array.from(sharers)
              .filter((p) => p !== person.id)
              .map((id) => personsByName.get(id)?.name || id)
            farmEvidence.push(`${type}=${val} shared with ${names.join(', ')}`)
          }
        }
      }
      if (farmEvidence.length > 0) {
        indicators.push({
          code: 'I3_LAPTOP_FARM_INFRA',
          rule: 'Work sessions/device fingerprint/IP shared across multiple identities — proxy-run "laptop farm" pattern.',
          weight: WEIGHTS.laptopFarmInfra,
          evidence: farmEvidence,
        })
      }

      // I4 — access from the DPRK-nationally allocated IP space
      const dprkIpEvidence = Array.from(bag.get('ip') ?? [])
        .filter((val) => val.startsWith(DPRK_IP_PREFIX))
        .map((ip) => `ip=${ip} (${DPRK_IP_PREFIX}0/24 allocated to the DPRK)`)
      if (dprkIpEvidence.length > 0) {
        indicators.push({
          code: 'I4_DPRK_IP_RANGE',
          rule: `One of the active sessions originates from the ${DPRK_IP_PREFIX}0/24 range allocated to the DPRK.`,
          weight: WEIGHTS.dprkNeighborhoodIp,
          evidence: dprkIpEvidence,
        })
      }

      // Inbound and outbound money movement on owned accounts
      const inbound = txnRows.filter((t) => ownedIds.includes(t.dstId))
      const outbound = txnRows.filter((t) => ownedIds.includes(t.srcId))

      // I5 — income received via cryptocurrency instead of direct payroll
      const cryptoInflows = inbound.filter(
        (t) =>
          t.type === 'crypto_swap' ||
          accountMeta.get(t.srcId)?.type === 'crypto_exchange',
      )
      for (const flow of cryptoInflows.slice(0, 5)) {
        cryptoRemittanceFlows.push({
          subjectPersonId: person.id,
          subjectPersonName: person.name || person.id,
          fromAccountId: flow.srcId,
          toAccountId: flow.dstId,
          amount: flow.amount ?? 0,
          currency: flow.currency || 'USD',
          transactionType: flow.type || 'unknown',
        })
      }
      if (cryptoInflows.length > 0) {
        indicators.push({
          code: 'I5_CRYPTO_REMITTANCE_DEMAND',
          rule: 'Requests or receives payment via cryptocurrency transfers instead of direct payroll deposit.',
          weight: WEIGHTS.cryptoRemittance,
          evidence: cryptoInflows
            .slice(0, 3)
            .map(
              (f) =>
                `${f.currency || 'USD'} ${f.amount ?? 0} ${f.type || 'transfer'} ${f.srcId} -> ${f.dstId}`,
            ),
        })
      }

      // I6 — outbound funds to DPRK front companies / sanctioned conduits
      for (const t of outbound) {
        const dstMeta = accountMeta.get(t.dstId)
        const srcMeta = accountMeta.get(t.srcId)
        const matched =
          matchedFrontToken(dstMeta?.bank) ||
          matchedFrontToken(dstMeta?.accountNumber)
        if (!matched) continue
        frontCompanyRemittances.push({
          subjectPersonId: person.id,
          subjectPersonName: person.name || person.id,
          fromAccountId: t.srcId,
          toAccountId: t.dstId,
          toBank: dstMeta?.bank,
          toCountry: dstMeta?.country,
          amount: t.amount ?? 0,
          currency: t.currency || 'USD',
          transactionType: t.type,
          matchedToken: matched,
        })
        indicators.push({
          code: 'I6_DPRK_FRONT_COMPANY_FUNDS',
          rule: 'Salary routed onward to a DPRK front company / OFAC-designated conduit that remits income to DPRK state agencies.',
          weight: WEIGHTS.dprkFrontFunds,
          evidence: [
            `${t.currency || 'USD'} ${t.amount ?? 0} ${t.type || 'wire'} ${srcMeta?.accountNumber || t.srcId} -> ${dstMeta?.accountNumber || t.dstId} ("${dstMeta?.bank || 'unknown bank'}", ${dstMeta?.country || '?'}) [matched: ${matched}]`,
          ],
        })
      }

      // I7 — payment accounts nested in DPRK proxy jurisdictions
      const proxyEvidence: string[] = []
      const claimedCountry = normalizeNationality(
        person.nationality,
      ).toUpperCase()
      for (const accId of ownedIds) {
        const meta = accountMeta.get(accId)
        const country = (meta?.country ?? '').toUpperCase()
        if (PROXY_JURISDICTIONS.has(country) && country !== claimedCountry) {
          proxyEvidence.push(
            `account ${meta?.accountNumber || accId} domiciled ${country} (bank "${meta?.bank || 'unknown'}")`,
          )
        }
      }
      if (proxyEvidence.length > 0) {
        indicators.push({
          code: 'I7_PROXY_JURISDICTION_ACCOUNTS',
          rule: 'Payment accounts held in China/Russia/Laos proxy jurisdictions used to obfuscate the actual DPRK operator.',
          weight: WEIGHTS.proxyJurisdictionAccounts,
          evidence: proxyEvidence,
        })
      }

      // I8 — simultaneous multiple employers (team-operated identities)
      const distinctIncomeSources = new Set(
        inbound.filter((t) => (t.amount ?? 0) >= 10000).map((t) => t.srcId),
      )
      if (distinctIncomeSources.size >= 2) {
        indicators.push({
          code: 'I8_MULTI_SOURCE_INCOME',
          rule: 'Income from multiple concurrent employers/pay-outs under one identity — DPRK operatives frequently work several jobs at once.',
          weight: WEIGHTS.multiSourceIncome,
          evidence: [
            `>=2 distinct payer accounts (${Array.from(distinctIncomeSources).join(', ')})`,
          ],
        })
      }

      const riskScore = Math.min(
        100,
        indicators.reduce((sum, i) => sum + i.weight, 0),
      )
      if (riskScore >= reportingThreshold) {
        subjects.push({
          personId: person.id,
          personName: person.name || person.id,
          claimedNationality: person.nationality,
          riskScore,
          riskLevel: riskLevelForScore(riskScore),
          indicators,
          recommendedAction: actionForScore(riskScore),
        })
      }
    }

    const alerted = subjects.slice().sort((a, b) => b.riskScore - a.riskScore)

    const totalAlerts =
      alerted.length +
      sharedInfrastructure.length +
      frontCompanyRemittances.length +
      cryptoRemittanceFlows.length

    return {
      personsEvaluated: people.length,
      suspectedNkWorkers: alerted,
      sharedInfrastructure,
      frontCompanyRemittances,
      cryptoRemittanceFlows,
      totalAlerts,
      framework: {
        alertSource:
          'Indicators modeled on the July 31 2026 multi-government alert on DPRK IT workers (U.S. Dept of State & FBI with JP/KR/AU/CA/FR/DE/IT/NL/NZ/UK) and public prosecutions (DOJ-EOIR cases 2025-2026).',
        references: [
          'UNSCR 2397: all Member States must repatriate DPRK nationals earning income in their jurisdiction (limited exceptions).',
          'FATF: DPRK is a high-risk jurisdiction subject to a Call for Action (blacklist) — countermeasures against proliferation financing.',
          'OFAC (Jan 2025): designations for Korea Osong Shipping Co, Chonsurim Trading Corporation, Liaoning China Trade Industry Co. and their operators.',
        ],
        regulatoryActions: [
          'Suspend or void the engagement: contracting/paying DPRK IT workers may violate domestic law in the U.S., Japan, Korea and partner jurisdictions.',
          'Preserve evidence and report to OFAC / your national FIU (e.g. FinCEN SAR filing).',
          'Screen every subject sharing the infrastructure cluster — DPRK operatives usually run in teams.',
        ],
      },
    }
  }
}
