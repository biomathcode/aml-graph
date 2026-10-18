import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  FalkorDBClient,
  AMLDataLoader,
  createBenchmarkAMLDataset,
  EntityResolutionDetector,
  WCCDetector,
  CentralityDetector,
  CycleDetector,
  SmurfingDetector,
  ScatterGatherDetector,
  RiskTracingDetector,
  AMLRiskScorer,
  NkWorkerDetector,
} from '../src/index.js'

describe('FalkorDB AML Graph Algorithms & Typologies', () => {
  let client: FalkorDBClient
  let loader: AMLDataLoader
  const testGraphName = 'test_aml_benchmark'

  let isAlive = false

  beforeAll(async () => {
    client = new FalkorDBClient({
      host: '127.0.0.1',
      port: 6380,
      graphName: testGraphName,
    })

    isAlive = await client.ping()
    if (!isAlive) {
      console.warn(
        'FalkorDB is not reachable on 127.0.0.1:6380. Skipping live integration tests.',
      )
      return
    }

    // Clean existing graph if any
    await client.deleteGraph()

    // Ingest IBM AMLSim benchmark dataset
    loader = new AMLDataLoader(client)
    const dataset = createBenchmarkAMLDataset()
    const result = await loader.loadDataset(dataset)

    expect(result.success).toBe(true)
    expect(result.accountsLoaded).toBeGreaterThan(15)
    expect(result.transactionsLoaded).toBeGreaterThan(15)
    expect(result.personsLoaded).toBeGreaterThan(4)
  })

  afterAll(async () => {
    if (client && isAlive) {
      await client.deleteGraph().catch(() => {})
      await client.close()
    }
  })

  it('1. Entity Resolution: detects synthetic identities and shared credentials', async () => {
    if (!isAlive) return
    const detector = new EntityResolutionDetector(client)
    const result = await detector.resolveEntities({ similarityThreshold: 0.7 })

    expect(result.pairwiseMatches.length).toBeGreaterThanOrEqual(2)

    // Victor Vance & V. Vance Holdings LLC sharing Tax ID, Phone, and Device
    const victorMatch = result.pairwiseMatches.find(
      (m) =>
        (m.personA === 'PER_VICTOR_1' && m.personB === 'PER_VICTOR_2') ||
        (m.personA === 'PER_VICTOR_2' && m.personB === 'PER_VICTOR_1'),
    )
    expect(victorMatch).toBeDefined()
    expect(victorMatch?.similarityScore).toBeGreaterThanOrEqual(0.9)
    expect(victorMatch?.sharedIdentifiers.map((i) => i.type)).toContain('taxId')
    expect(victorMatch?.sharedIdentifiers.map((i) => i.type)).toContain('phone')

    // Mule Operators sharing Device Fingerprint & IP
    const muleMatch = result.pairwiseMatches.find(
      (m) =>
        (m.personA === 'PER_MULE_OPERATOR_A' &&
          m.personB === 'PER_MULE_OPERATOR_B') ||
        (m.personA === 'PER_MULE_OPERATOR_B' &&
          m.personB === 'PER_MULE_OPERATOR_A'),
    )
    expect(muleMatch).toBeDefined()
    expect(muleMatch?.sharedIdentifiers.map((i) => i.type)).toContain(
      'deviceId',
    )

    // Clusters check
    expect(result.clusters.length).toBeGreaterThanOrEqual(2)
    expect(result.syntheticIdentityRiskAlerts.length).toBeGreaterThanOrEqual(2)
  })

  it('2. Weakly Connected Components (WCC): segments isolated payment rings', async () => {
    if (!isAlive) return
    const wcc = new WCCDetector(client)
    const result = await wcc.findComponents()

    expect(result.totalComponents).toBeGreaterThanOrEqual(2)
    expect(result.components.length).toBeGreaterThanOrEqual(2)

    // At least one component should be flagged as HIGH or MEDIUM risk
    const highRiskComp = result.components.find(
      (c) => c.riskRating === 'HIGH' || c.riskRating === 'MEDIUM',
    )
    expect(highRiskComp).toBeDefined()
    expect(highRiskComp!.totalVolume).toBeGreaterThan(0)
  })

  it('3. Centrality & PageRank: identifies transaction conduits and flow hubs', async () => {
    if (!isAlive) return
    const detector = new CentralityDetector(client)
    const result = await detector.computeCentrality()

    expect(result.pageRank.length).toBeGreaterThan(0)
    expect(result.pageRank[0].rank).toBe(1)
    expect(result.pageRank[0].score).toBeGreaterThan(0)

    // Flow hubs check
    const aggregator = result.flowHubs.find(
      (h) => h.accountId === 'ACC_AGGREGATOR_MAIN',
    )
    expect(aggregator).toBeDefined()
    expect(aggregator?.role).toBe('funnel_aggregator')
    expect(aggregator?.inDegree).toBeGreaterThanOrEqual(3)

    const disperser = result.flowHubs.find(
      (h) => h.accountId === 'ACC_DISPERSER_MAIN',
    )
    expect(disperser).toBeDefined()
    expect(disperser?.role).toBe('dispersion_source')
    expect(disperser?.outDegree).toBeGreaterThanOrEqual(3)
  })

  it('4. Cycle Detection: detects circular round-tripping money flows', async () => {
    if (!isAlive) return
    const detector = new CycleDetector(client)
    const result = await detector.detectCycles({ minHop: 3, maxHop: 4 })

    expect(result.totalCyclesFound).toBeGreaterThanOrEqual(1)

    // Verify 3-hop cycle between shell companies A -> B -> C -> A
    const shellCycle = result.detectedCycles.find(
      (c) =>
        c.accounts.includes('ACC_CYCLE_A') &&
        c.accounts.includes('ACC_CYCLE_B') &&
        c.accounts.includes('ACC_CYCLE_C'),
    )
    expect(shellCycle).toBeDefined()
    expect(shellCycle?.cycleLength).toBe(3)
    expect(shellCycle?.amountPreservationRate).toBeGreaterThan(0.9) // ~94% preserved
    expect(shellCycle?.riskScore).toBeGreaterThanOrEqual(0.75)
  })

  it('5. Smurfing & Structuring: detects sub-threshold aggregation and dispersion', async () => {
    if (!isAlive) return
    const detector = new SmurfingDetector(client)
    const result = await detector.detectSmurfing({
      reportingThreshold: 10000,
      structuringFloor: 5000,
      minTransactions: 3,
    })

    expect(result.totalStructuringAlerts).toBeGreaterThanOrEqual(2)

    // Fan-In Aggregation at ACC_AGGREGATOR_MAIN
    const fanIn = result.fanInStructuring.find(
      (f) => f.targetAccountId === 'ACC_AGGREGATOR_MAIN',
    )
    expect(fanIn).toBeDefined()
    expect(fanIn?.transactionCount).toBe(4)
    expect(fanIn?.totalAmount).toBe(37900)
    expect(fanIn?.avgAmount).toBeGreaterThan(9000)
    expect(fanIn?.avgAmount).toBeLessThan(10000)
    expect(fanIn?.riskScore).toBeGreaterThanOrEqual(0.8)

    // Fan-Out Dispersion from ACC_DISPERSER_MAIN
    const fanOut = result.fanOutStructuring.find(
      (f) => f.sourceAccountId === 'ACC_DISPERSER_MAIN',
    )
    expect(fanOut).toBeDefined()
    expect(fanOut?.transactionCount).toBe(4)
    expect(fanOut?.totalAmount).toBe(38100)
    expect(fanOut?.riskScore).toBeGreaterThanOrEqual(0.8)
  })

  it('6. Scatter-Gather: detects multi-mule layering and consolidation', async () => {
    if (!isAlive) return
    const detector = new ScatterGatherDetector(client)
    const result = await detector.detectScatterGather({ minMules: 2 })

    expect(result.totalPatternsFound).toBeGreaterThanOrEqual(1)

    const pattern = result.patterns.find(
      (p) =>
        p.sourceAccountId === 'ACC_SCATTER_SRC' &&
        p.destinationAccountId === 'ACC_GATHER_DEST',
    )
    expect(pattern).toBeDefined()
    expect(pattern?.muleAccountIds.length).toBe(3)
    expect(pattern?.muleAccountIds).toContain('ACC_MULE_1')
    expect(pattern?.muleAccountIds).toContain('ACC_MULE_2')
    expect(pattern?.muleAccountIds).toContain('ACC_MULE_3')
    expect(pattern?.gatheredAmount).toBeGreaterThan(80000)
    expect(pattern?.leakageRate).toBeLessThan(0.1) // minimal retention by mules
    expect(pattern?.riskScore).toBeGreaterThanOrEqual(0.8)
  })

  it('7. Risk Tracing: detects multi-hop paths to OFAC-sanctioned accounts', async () => {
    if (!isAlive) return
    const detector = new RiskTracingDetector(client)
    const result = await detector.traceSanctionExposures({ maxHops: 3 })

    expect(result.totalExposuresFound).toBeGreaterThanOrEqual(2)

    // Direct exposure: ACC_CONDUIT_PROXY (1-hop)
    const direct = result.exposures.find(
      (e) => e.targetAccountId === 'ACC_CONDUIT_PROXY',
    )
    expect(direct).toBeDefined()
    expect(direct?.hopDistance).toBe(1)
    expect(direct?.directTransfer).toBe(true)
    expect(direct?.decayedRiskScore).toBe(1.0)

    // Indirect exposure: ACC_TARGET_RECIPIENT (2-hops)
    const indirect = result.exposures.find(
      (e) => e.targetAccountId === 'ACC_TARGET_RECIPIENT',
    )
    expect(indirect).toBeDefined()
    expect(indirect?.hopDistance).toBe(2)
    expect(indirect?.directTransfer).toBe(false)
    expect(indirect?.decayedRiskScore).toBeGreaterThan(0.5)
  })

  it('8. AML Risk Scorer: produces unified compliance scoring & SAR narrative', async () => {
    if (!isAlive) return
    const scorer = new AMLRiskScorer(client)

    // Case A: Sanctioned Entity
    const sanctionReport = await scorer.evaluateAccount('ACC_SANCTIONED_ENTITY')
    expect(sanctionReport.riskScore).toBe(100)
    expect(sanctionReport.riskLevel).toBe('CRITICAL')
    expect(sanctionReport.recommendedAction).toBe('FREEZE_ACCOUNTS')

    // Case B: Smurfing Aggregator
    const aggregatorReport = await scorer.evaluateAccount('ACC_AGGREGATOR_MAIN')
    expect(aggregatorReport.riskScore).toBeGreaterThanOrEqual(70)
    expect(
      aggregatorReport.flags.some((f) => f.includes('FAN_IN_STRUCTURING')),
    ).toBe(true)
    expect(['HIGH', 'CRITICAL']).toContain(aggregatorReport.riskLevel)
    expect(['FILE_SAR', 'FREEZE_ACCOUNTS']).toContain(
      aggregatorReport.recommendedAction,
    )

    // Case C: Clean Retail Customer
    const retailReport = await scorer.evaluateAccount('ACC_RETAIL_1')
    expect(retailReport.riskScore).toBeLessThan(30)
    expect(['CLEAN', 'LOW']).toContain(retailReport.riskLevel)
    expect(retailReport.recommendedAction).toBe('APPROVE')
  })

  it('9. DPRK IT-Worker Screening: flags North Korean remote-worker operatives', async () => {
    if (!isAlive) return
    const detector = new NkWorkerDetector(client)
    const result = await detector.screenNkIndicators()
    expect(result.personsEvaluated).toBeGreaterThan(6)

    // The two laptop-farm operatives must be flagged CRITICAL
    const names = result.suspectedNkWorkers.map((s) => s.personName)
    expect(names).toContain('Grace Miller')
    expect(names).toContain('Daniel Cooper')
    for (const suspect of result.suspectedNkWorkers.filter(
      (s) =>
        s.personName === 'Grace Miller' || s.personName === 'Daniel Cooper',
    )) {
      expect(suspect.riskLevel).toBe('CRITICAL')
      const codes = suspect.indicators.map((i) => i.code)
      expect(codes).toContain('I4_DPRK_IP_RANGE')
      expect(codes).toContain('I6_DPRK_FRONT_COMPANY_FUNDS')
    }

    // Grace must carry the stolen third-party identity indicator
    const grace = result.suspectedNkWorkers.find(
      (s) => s.personName === 'Grace Miller',
    )
    expect(
      grace?.indicators.some((i) => i.code === 'I2_THIRD_PARTY_IDENTITY_REUSE'),
    ).toBe(true)

    // Laptop-farm shared device/IP infrastructure must be reported
    expect(
      result.sharedInfrastructure.some(
        (i) => i.value === 'DEV-LAPTOP-FARM-22' || i.value === '175.45.176.72',
      ),
    ).toBe(true)

    // USDT remittances to OFAC-designated DPRK fronts must be traced
    expect(
      result.frontCompanyRemittances.some(
        (f) => f.toBank?.includes('Chonsurim') || f.toBank?.includes('Osong'),
      ),
    ).toBe(true)

    // Legitimate subjects must NOT be flagged
    expect(names).not.toContain('Alice Johnson')
    expect(names).not.toContain('Nora Larsen')
    expect(names).not.toContain('Michael Torres')
  })
})
