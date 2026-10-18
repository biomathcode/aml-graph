# @open-kyc/falkordb-aml

A high-performance Anti-Money Laundering (AML) graph algorithms and financial crime typology detection library powered by **FalkorDB**  and IBM AMLSim benchmark specifications.

---

## 🚀 Key Features & Implemented Typologies

Deterministic, graph-theoretic detectors implemented directly against FalkorDB, benchmarked against IBM AMLSim and real-world multi-national advisory typologies:

### 1. Entity Resolution & Identity Clustering (`entityResolution.ts`)
Discovers disparate applicants or customer profiles that share deterministic credentials (tax ID, phone, email, device ID, IP, address, document number) and groups them into unified identity clusters using graph connectivity.

```cypher
MATCH (p1:Person)-[:HAS_IDENTIFIER]->(i:Identifier)<-[:HAS_IDENTIFIER]-(p2:Person)
WHERE p1.id < p2.id
RETURN p1.id AS p1_id, p2.id AS p2_id, collect(i.type) AS shared_types, collect(i.val) AS shared_vals
```

```mermaid
graph LR
  subgraph Cluster["Identity Resolution Cluster (Similarity Score: 0.99)"]
    P1["Person: Victor Vance (Individual)"]
    P2["Person: V. Vance Holdings LLC (Entity)"]
    I1["Identifier: SSN-000-88-7777 (weight 0.95)"]
    I2["Identifier: DEV-FINGERPRINT-X99 (weight 0.85)"]
    I3["Identifier: +1-503-555-0192 (weight 0.80)"]
    I4["Identifier: 742 Evergreen Terrace (weight 0.55)"]
  end

  P1 -->|HAS_IDENTIFIER| I1
  P2 -->|HAS_IDENTIFIER| I1
  P1 -->|HAS_IDENTIFIER| I2
  P2 -->|HAS_IDENTIFIER| I2
  P1 -->|HAS_IDENTIFIER| I3
  P2 -->|HAS_IDENTIFIER| I3
  P1 -->|HAS_IDENTIFIER| I4
  P2 -->|HAS_IDENTIFIER| I4
```

### 2. Circular Flow & Round-Tripping Cycles (`cycleDetection.ts`)
Traverses directed cycles (3 to 5 hops) where funds loop back to the origin or affiliates to disguise the source of wealth: `(A) -> (B) -> (C) -> (A)`. Evaluates temporal bounds ($\le 720\text{ hours}$) and fund preservation rates ($\ge 60\%$).

```cypher
MATCH (a:Account)-[t1:TRANSFERRED]->(b:Account)-[t2:TRANSFERRED]->(c:Account)-[t3:TRANSFERRED]->(a:Account)
WHERE a.id < b.id AND a.id < c.id AND b.id <> c.id
RETURN a.id AS a_id, b.id AS b_id, c.id AS c_id, t1, t2, t3
```

```mermaid
graph LR
  A["Account A (AlphaBank, Cayman)"]
  B["Account B (BetaFinancial, Panama)"]
  C["Account C (BVI Trust)"]

  A -->|"1. $50,000 (t0)"| B
  B -->|"2. $48,500 (t0 + 3h)"| C
  C -->|"3. $47,000 (t0 + 8h)"| A
```

### 3. Smurfing & Structuring (`smurfing.ts`)
Detects attempts to evade mandatory statutory Currency Transaction Reporting (CTR) thresholds ($10,000 / €10,000):
- **Fan-In (Aggregation)**: Multiple sub-threshold deposits ($5,000–$9,999) flowing into a single accumulator within 72 hours.
- **Fan-Out (Dispersion)**: Single account dispersing sub-threshold payments across multiple beneficiaries.

```mermaid
graph TD
  subgraph FanIn["Fan-In Structuring (Accumulation under $10,000 CTR)"]
    S1["Origin Account 1"] -->|"$9,200"| AGG["Accumulator Account (Total: $27,600)"]
    S2["Origin Account 2"] -->|"$8,900"| AGG
    S3["Origin Account 3"] -->|"$9,500"| AGG
  end

  subgraph FanOut["Fan-Out Structuring (Rapid Dispersion)"]
    SRC["Dispersal Account ($25,000)"] -->|"$8,500"| D1["Beneficiary 1"]
    SRC -->|"$9,100"| D2["Beneficiary 2"]
    SRC -->|"$7,400"| D3["Beneficiary 3"]
  end
```

### 4. Scatter-Gather Mule Layering (`scatterGather.ts`)
Detects multi-path money-mule architectures: an origin account scatters funds across $N$ intermediate mule accounts, which promptly consolidate at a destination beneficiary within 24–72 hours to break simple audit trails.

```mermaid
graph LR
  SRC["Origin Account (Dispersal)"]
  M1["Mule Account 1"]
  M2["Mule Account 2"]
  M3["Mule Account 3"]
  DST["Destination Beneficiary (Consolidation)"]

  SRC -->|"Scatter $15,000"| M1
  SRC -->|"Scatter $15,000"| M2
  SRC -->|"Scatter $15,000"| M3

  M1 -->|"Gather $14,200"| DST
  M2 -->|"Gather $14,300"| DST
  M3 -->|"Gather $14,500"| DST
```

### 5. PageRank & Flow Hub Centrality (`centrality.ts`)
Executes native GraphBLAS `CALL algo.pageRank('Account', 'TRANSFERRED')` and calculates In-Degree / Out-Degree volume flow ratios to classify accounts into operational roles:
- `funnel_aggregator`: In/Out ratio $> 3.0$ (collection point).
- `dispersion_source`: In/Out ratio $< 0.33$ (distribution point).
- `transit_hub`: High PageRank centrality with balanced flows (pass-through conduit).

```mermaid
graph LR
  subgraph Aggregator["Funnel Aggregator (In/Out > 3.0)"]
    IN1["Deposit 1"] --> AGG["Collection Account"]
    IN2["Deposit 2"] --> AGG
    IN3["Deposit 3"] --> AGG
    AGG --> OUT1["Outflow"]
  end

  subgraph Transit["Transit Hub (PageRank Top 5%, Flow Balanced)"]
    T_IN["Rapid Inflow"] --> HUB["Conduit Account (High Centrality)"]
    HUB --> T_OUT["Rapid Outflow"]
  end

  subgraph Disperser["Dispersion Source (In/Out < 0.33)"]
    DISP["Primary Source"] --> D_OUT1["Dispersal 1"]
    DISP --> D_OUT2["Dispersal 2"]
    DISP --> D_OUT3["Dispersal 3"]
  end
```

### 6. Sanctions & PEP Exposure Tracing (`riskTracing.ts`)
Traces multi-hop paths up to 4 hops away from OFAC / SDN / PEP flagged entities, applying distance-decay exposure scoring:

$$\text{Exposure Score} = \text{BaseRisk} \times 0.65^{\text{hops}}$$

```mermaid
graph LR
  SUB["Subject Account (Under Review)"]
  HOP1["Hop 1: Intermediary Bank (65% exposure)"]
  HOP2["Hop 2: Offshore Exchange (42.3% exposure)"]
  HOP3["Hop 3: Correspondent Conduit (27.5% exposure)"]
  SANCTION["Sanctioned Account / OFAC SDN (100% risk)"]

  SUB -->|"TRANSFERRED"| HOP1
  HOP1 -->|"TRANSFERRED"| HOP2
  HOP2 -->|"TRANSFERRED"| HOP3
  HOP3 -->|"TRANSFERRED"| SANCTION
```

### 7. DPRK Remote Worker & Laptop-Farm Screening (`nkWorkerDetection.ts`)
Screens contractor identities and payment paths against the July 2026 multi-government advisory across 8 weighted indicators:
- Shared laptop-farm device fingerprints and connection IPs.
- Verification sessions originating from the DPRK-allocated IP block (`175.45.176.0/24`).
- Reused identity documents / tax IDs.
- Outbound salary routing to cryptocurrency exchanges/swaps or OFAC-designated revenue fronts (Korea Osong, Chonsurim).

```mermaid
graph TD
  subgraph Operatives["DPRK IT Worker Operatives"]
    OP1["Operative: Grace Miller (Stolen Identity)"]
    OP2["Operative: Daniel Cooper (Stolen Identity)"]
  end

  subgraph Infrastructure["Shared Laptop Farm Infrastructure"]
    DEV["Device Fingerprint: DEV-LAPTOP-FARM-22"]
    IP["DPRK IP Range: 175.45.176.0/24"]
  end

  subgraph Employers["Western Tech Platforms"]
    EMP1["AI Evaluation Platform (Mercor / DataAnnotation)"]
    EMP2["Remote Tech Client"]
  end

  subgraph Financial["Salary Siphoning Channels"]
    MULE["Mule Bank Account (30% retained)"]
    CRYPTO["Crypto OTC / Swap (USDT Conversion)"]
    FRONT["OFAC Sanctioned Front (Korea Osong / Chonsurim)"]
  end

  OP1 -->|HAS_IDENTIFIER| DEV
  OP2 -->|HAS_IDENTIFIER| DEV
  OP1 -->|HAS_IDENTIFIER| IP
  OP2 -->|HAS_IDENTIFIER| IP

  EMP1 -->|"Salary Deposit"| MULE
  EMP2 -->|"Salary Deposit"| MULE

  OP1 -->|OWNS| MULE
  MULE -->|"70% Wire"| CRYPTO
  CRYPTO -->|"Remittance"| FRONT
```

### 8. Weakly Connected Components (WCC) (`wcc.ts`)
Partitions the global transaction graph into isolated payment rings and transaction subnetworks using native `CALL algo.WCC()`, computing internal transaction volumes, node counts, and risk density per component.

### 9. Unified AML Risk Engine & SAR Generation (`riskScorer.ts`)
Aggregates all topological signals into an overall 0–100 Risk Score, categorizes risk levels (`CLEAN`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), and generates Suspicious Activity Report (SAR) narratives citing the exact graph evidence for compliance escalation.

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
