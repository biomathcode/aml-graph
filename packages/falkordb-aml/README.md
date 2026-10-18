# @open-kyc/falkordb-aml

A high-performance Anti-Money Laundering (AML) graph algorithms and financial crime typology detection library powered by **FalkorDB**  and IBM AMLSim benchmark specifications.

---

## 🚀 Key Features & Implemented Typologies


 The **IBM AMLSim** benchmark dataset:

1. **Entity Resolution & Identity Clustering**:
   - Detects shared deterministic credentials (`taxId`/SSN, `phone`, `email`, `deviceId`, `ip`, `address`) across disparate customer profiles.
   - Calculates pairwise similarity scoring.
   - Executes Graph Component Clustering to identify synthetic identity fraud and multi-accounting rings.

2. **Weakly Connected Components (WCC)**:
   - Partitions the global transaction graph into distinct payment rings and transaction subnetworks using native `CALL algo.WCC()`.
   - Computes internal transaction volumes, node counts, and risk severity per component.

3. **PageRank & Flow Hub Centrality**:
   - Executes native `CALL algo.pageRank('Account', 'TRANSFERRED')`.
   - Calculates In-Degree / Out-Degree flow ratios to classify accounts into operational roles:
     - `funnel_aggregator`: high inbound volume / multiple depositors.
     - `dispersion_source`: high outbound volume / rapid dispersal.
     - `transit_hub`: pass-through conduit account.

4. **Circular Flow / Round-Tripping (Cycle Detection)**:
   - Traverses directed cycles (3 to 5 hops) where funds loop back to the origin or affiliates to disguise source of wealth: `(A) -> (B) -> (C) -> (A)`.
   - Analyzes velocity, duration windows, and fund preservation rates (fee retention).

5. **Smurfing & Structuring (Fan-In / Fan-Out)**:
   - Identifies attempts to evade mandatory statutory currency transaction reporting (CTR) thresholds ($10,000 / €10,000).
   - **Fan-In (Aggregation)**: Multiple sub-threshold deposits into a single accumulator within a short time window.
   - **Fan-Out (Dispersion)**: Single account dispersing sub-threshold payments across multiple beneficiaries.

6. **Scatter-Gather (Mule Layering)**:
   - Detects multi-path money mule architectures: Origin account scatters funds across $N$ intermediate mule accounts, which promptly consolidate at a destination beneficiary.

7. **Sanctions & PEP Exposure Tracing**:
   - Traces multi-hop paths to OFAC / SDN / PEP flagged entities.
   - Applies distance-decay exposure scoring (`baseRisk * (decayFactor ^ hops)`).

8. **Unified AML Risk Engine & SAR Generation**:
   - Aggregates topological signals into an overall Risk Score `[0 - 100]`, risk rating (`CLEAN`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), and generates compliance Suspicious Activity Report (SAR) narratives.

---

## 📦 Installation & Setup

```bash
# Within the open-kyc monorepo:
npm install
```

Ensure FalkorDB is running:
```bash
docker compose up -d falkordb
```

---

## 💡 Quick Start Example

```typescript
import {
  FalkorDBClient,
  AMLDataLoader,
  createBenchmarkAMLDataset,
  CycleDetector,
  SmurfingDetector,
  AMLRiskScorer,
} from '@open-kyc/falkordb-aml'

// 1. Initialize client
const client = new FalkorDBClient({
  host: '127.0.0.1',
  port: 6380,
  graphName: 'production_aml_graph',
})

// 2. Ingest benchmark or real transaction data
const loader = new AMLDataLoader(client)
const dataset = createBenchmarkAMLDataset()
await loader.loadDataset(dataset)

// 3. Detect Smurfing & Structuring
const smurfingDetector = new SmurfingDetector(client)
const smurfing = await smurfingDetector.detectSmurfing({
  reportingThreshold: 10000,
  structuringFloor: 5000,
  minTransactions: 3,
})
console.log('Smurfing alerts:', smurfing.fanInStructuring)

// 4. Detect Round-Tripping Cycles
const cycleDetector = new CycleDetector(client)
const cycles = await cycleDetector.detectCycles({ minHop: 3, maxHop: 4 })
console.log('Circular flows found:', cycles.detectedCycles)

// 5. Evaluate Account & Generate SAR Report
const scorer = new AMLRiskScorer(client)
const report = await scorer.evaluateAccount('ACC_AGGREGATOR_MAIN')
console.log('AML Risk Score:', report.riskScore) // e.g. 85 (HIGH)
console.log('Recommended Action:', report.recommendedAction) // FILE_SAR
console.log('SAR Narrative:', report.suspiciousActivitySummary)
```

---

## 🧪 Testing

Run the test suite against live FalkorDB:

```bash
npm test
# Or run specifically:
npx vitest run packages/falkordb-aml/test/falkordb-aml.test.ts
```
