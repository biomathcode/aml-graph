# OpenKYC

Self-hosted know-your-customer (KYC) application for document collection and manual identity review. Operators build workflows, share secret collection links, and review submissions from a tenant-scoped dashboard. Optical character recognition (OCR) and graph-based anti-money laundering (AML) analysis assist the reviewer; the decision stays manual.

## Showcase

![Dashboard with verification stats, status breakdown, and recent submissions](assets/dashboard.png)

| Workflows | Verifications |
| :---: | :---: |
| ![Workflow list with checklists and activation states](assets/workflows.png) | ![Verification sessions with live status and QR collection links](assets/verification.png) |

| Agentic chat | Brand customization |
| :---: | :---: |
| ![Compliance chat answering questions with cited records, graph signals, and OCR sources](assets/agentic_chat.png) | ![Brand customization with organization name, logo, privacy policy, and accent color](assets/customization.png) |

## How it works

```mermaid
sequenceDiagram
  autonumber
  actor O as Operator
  actor S as Subject
  participant API as Express API
  participant DB as PostgreSQL & Redis
  participant OCR as Indra OCR & Tesseract Ensemble
  participant FDB as FalkorDB (Identity Graph & Vectors)
  participant AML as AML Scorer (@open-kyc/falkordb-aml)

  O->>API: create workflow and collection session
  API-->>O: secret collection link
  O->>S: share link
  S->>API: upload documents + identity hints + telemetry
  API->>DB: store raw file bytes, session state, connection IP & deviceId
  API->>OCR: enqueue extraction (schema-driven)
  par Dual-Engine Extraction
    OCR->>OCR: probe Indra service + parse schema / TD3 MRZ
    OCR->>OCR: execute local Tesseract ensemble fallback
  end
  OCR->>OCR: arbitrate field confidence & digit integrity
  OCR-->>API: normalized fields (first_name, doc_number, tax_id, accounts)
  API->>FDB: ingestOcrIntoGraph (MERGE :Person, :Document, :Identifier, :Account)
  API->>FDB: embedSessionGraph (2048-dim vecf32 embeddings via NVIDIA NIM)
  API->>AML: run AML detectors (cycles, smurfing, scatter-gather, DPRK screening)
  AML->>FDB: execute Cypher traversals & GraphBLAS algorithms
  AML-->>API: risk signals, score (0-100), and SAR narrative
  API->>DB: update session with AML risk report & status
  API-->>O: live WebSocket update (SSE / Redis PubSub)
  O->>API: review signals, inspect graph evidence, approve or reject
  API->>DB: append immutable audit log
```

Collection and review are separate states: a completed collection can still have a pending review, and the application does not infer identity validity from an upload alone.

### Indra OCR and extraction ensemble

The document extraction pipeline uses a resilient, dual-engine architecture (`server/ocr.ts` and `server/ocr-indra/`) to guarantee field accuracy without blocking the event loop:

1. **Fast Probing & Health Check**: Before uploading document bytes, the pipeline issues a 1.5-second probe to the Indra OCR Python microservice (`/health`). If unreachable or timing out, it fails over immediately to the local Tesseract ensemble without introducing network lag.
2. **Schema-Driven Extraction**: Documents are parsed according to structured schemas (`passport`, `driving_license`, `national_id`, `utility_bill`, `bank_statement`, `tax_form`, `resume`). For travel documents, the engine executes a dedicated TD3 Machine Readable Zone (MRZ) parser for line 1 and line 2 check-digits.
3. **Dual-Engine Quality Arbitration**: Even when Indra answers successfully, the local Tesseract pass runs concurrently. A deterministic arbitration engine merges the extractions field-by-field:
   - Compares per-field confidence scores.
   - Enforces digit integrity on identifier fields (preventing dropped numbers in passports or tax IDs).
   - Resolves printed form labels (`Surname`, `Given Names`, `Nationality`).
   - Tags the resulting extraction as `indra-ocr+local-fallback` or `local-tesseract-fallback`.

```mermaid
flowchart TD
  DOC["Uploaded Document (Image / PDF)"] --> PROBE{"Probe Indra OCR Service (/health, 1.5s timeout)"}

  PROBE -->|"Online"| INDRA["Indra OCR Service (/api/ocr/extract)"]
  PROBE -->|"Offline / Timeout"| TESS["Local Tesseract Ensemble Engine"]

  INDRA --> ARB["Field-Level Quality Arbitration Engine"]
  TESS --> ARB

  subgraph Arbitration["Arbitration & Validation"]
    ARB --> C1["Compare Per-Field Confidence"]
    ARB --> C2["Digit & Regex Validation (Tax ID, MRZ, Doc Number)"]
    ARB --> C3["Printed Label Parsing (Surname / Given Names)"]
  end

  Arbitration --> OUT["Normalized Extracted Fields + Full Markdown Text"]
```

### FalkorDB graph ingestion and vector indexing

Once fields are extracted, `server/aml/ocr-to-graph.ts` deterministically translates them into an in-memory property graph inside FalkorDB:

1. **Subject Anchor (`:Person`)**: A unique node representing the applicant, keyed by the collection session ID.
2. **Document Provenance (`:Document`)**: One node per uploaded file (`doc_<sessionId>_<type>`), capturing extracted category, document numbers, OCR engine provenance, and financial attributes (`closing_balance`, `amount_due`). Linked via `[:SUBMITTED_DOCUMENT]`.
3. **Cross-Session Anchors (`:Identifier`)**: Normalized, lowercase nodes created for every identity anchor:
   - `documentNumber`
   - `taxId` / SSN
   - `address`
   - `email`
   - `phone`
   - `ip` (client edge IP captured at upload)
   - `deviceId` (client device hardware fingerprint)
   
   Every `:Person` is linked via `[:HAS_IDENTIFIER {type}]`. **Shared `:Identifier` nodes are what connect separate subjects across time, immediately exposing laptop farms, identity reuse, and synthetic rings.**
4. **Financial Accounts (`:Account`)**: Financial institutions and account numbers extracted from utility bills, statements, and tax forms are merged as `:Account` nodes and connected via `[:OWNS {role: 'owner'}]`.
5. **Multimodal Vector Indexing (`server/aml/graph-vectors.ts`)**:
   - The node's ground-truth business properties are rendered into deterministic, sorted `key: value` text.
   - Embedded into 2048-dimensional dense vectors using NVIDIA NIM (`nvidia/nemotron-3-embed-1b`).
   - Stored on nodes as `vecf32` properties indexed with cosine similarity (`CREATE VECTOR INDEX FOR (n:Document) ON (n.embedding)...`).
   - Enables hybrid GraphRAG: the compliance agent searches vectors with `db.idx.vector.queryNodes` and immediately traverses neighboring graph edges to verify signals.

```mermaid
flowchart LR
  subgraph Extracted["Normalized OCR Fields & Telemetry"]
    F1["Name, DOB, Nationality"]
    F2["Document Number, Category, Type"]
    F3["Tax ID, Phone, Email, Address"]
    F4["Client IP & Hardware Device Fingerprint"]
    F5["Account Number, Bank Name, Balance"]
  end

  subgraph FalkorGraph["FalkorDB Property Graph & Vector Index"]
    P[":Person (id: sessionId)"]
    D[":Document (id: doc_sessionId_type, embedding: vecf32)"]
    I1[":Identifier (type: documentNumber)"]
    I2[":Identifier (type: taxId)"]
    I3[":Identifier (type: deviceId)"]
    I4[":Identifier (type: ip)"]
    A[":Account (id: acc_accountNumber)"]

    P -->|SUBMITTED_DOCUMENT| D
    P -->|HAS_IDENTIFIER| I1
    P -->|HAS_IDENTIFIER| I2
    P -->|HAS_IDENTIFIER| I3
    P -->|HAS_IDENTIFIER| I4
    P -->|"OWNS {role: 'owner'}"| A
  end

  F1 --> P
  F2 --> D
  F3 --> I1
  F3 --> I2
  F4 --> I3
  F4 --> I4
  F5 --> A
```

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    O["Operator dashboard"]
    P["Collection and form pages"]
    C["API clients"]
  end

  API["Express API"]

  subgraph Data
    PG[("PostgreSQL")]
    RD[("Redis")]
    FS["Private files<br/>local, S3, GCS, R2"]
  end

  subgraph Enrichment["Submission enrichment (in-process jobs)"]
    OCR["OCR<br/>Indra service + Tesseract fallback"]
    GR[("FalkorDB<br/>identity graph")]
    AML["AML risk scoring"]
  end

  N["Webhook and email dispatcher"]

  O --> API
  P --> API
  C --> API
  API --> PG
  API --> RD
  API --> FS
  API --> OCR
  OCR --> GR
  GR --> AML
  AML --> PG
  API --> N
  API -.->|live updates| O
```

| Component | Responsibility |
| --- | --- |
| React SPA | Operator dashboard, collection pages, questionnaire forms |
| Express | Auth routes, RPC and REST endpoints, uploads, downloads, live events, built frontend |
| PostgreSQL + Drizzle | Tenant records, file metadata, API keys, notification outbox, migrations |
| Redis | Single-use upload tickets, rate limits, live-update pub/sub |
| Storage adapters | Private document bytes on local disk, S3, GCS, or R2 |
| FalkorDB + `@open-kyc/falkordb-aml` | Identity graph, embeddings, graph-algorithm AML scoring |
| OCR | Indra service with a local Tesseract ensemble fallback |
| Notification dispatcher | Signed webhooks and email with bounded retries |

Production serves the SPA and `/api` from one Express origin. Compose runs PostgreSQL 17, Redis 7, FalkorDB, OCR, a one-shot migration service, and the app. The app starts after migrations finish. Enrichment runs inside the app process. Without FalkorDB or OCR, sessions settle with `amlStatus=unavailable` instead of blocking review.

## Quickstart

Requires Node.js 22+ and Docker Compose v2.

```sh
git clone https://github.com/biomathcode/aml-graph.git
cd open-kyc
npm run setup
```

`npm run setup` writes `.env` with random secrets (without overwriting an existing file), builds the images, starts the stack, and waits for the health check. Open [localhost:3000](http://localhost:3000), create an account, create an active workflow, and create a verification session. Share the generated link.

## Included

- **Collection**: expiring secret links, PDF/JPEG/PNG/WebP uploads up to 20 MB, 20 documents per session, filename search, private downloads.
- **Review**: approval or rejection with notes, audit history, blocklist signals, dashboard analytics.
- **Enrichment**: OCR field extraction; FalkorDB ingestion; AML scoring for cycles, structuring, scatter-gather layering, entity resolution, centrality, sanctions exposure, and DPRK IT-worker screening; graph embeddings (`nvidia/nemotron-3-embed-1b`); a cited compliance chat at `/agent`.
- **Integrations**: developer API keys and REST endpoints, signed webhooks with delivery status, SMTP notifications, optional Firecrawl search.
- **Platform**: Better Auth email/password with optional SMTP magic links and password reset, tenant-scoped queries, questionnaires, a billing view for self-hosted usage, live updates.
- **Storage**: local disk, AWS S3, Google Cloud Storage, Cloudflare R2.

## AML analysis

Completed submissions are ingested into FalkorDB as `:Person`, `:Document`, `:Identifier`, and `:Account` nodes, then scored by deterministic detectors (`@open-kyc/falkordb-aml`) — no LLM decides the verdict. Detectors emit typed signals with the graph evidence behind them, and the signals sum into a 0–100 risk report on the session.

### Two customers, one culprit

The `falkordb-aml` package ships a synthetic IBM-AMLSim-style benchmark graph (`packages/falkordb-aml/src/dataset/ibmAMLSim.ts`) that its tests and the agent's demo knowledge base load. Two of its records look unrelated at onboarding:

| Customer | Account | Relationship | Looks fine because |
| --- | --- | --- | --- |
| Victor Vance — individual, Springfield OR | ACC_CYCLE_A (CYC-001, AlphaBank, Cayman shell) | owner | plausible private-banking customer |
| V. Vance Holdings LLC — company | ACC_CYCLE_B (CYC-002, BetaFinancial, Panama shell) | signatory | plausible corporate customer |

Four graph facts expose what a per-customer review cannot see:

1. **A round trip.** $50,000 leaves `ACC_CYCLE_A`, arrives as $48,500 at `ACC_CYCLE_B`, moves as $47,000 to `ACC_CYCLE_C` (BVI trust), and returns to `ACC_CYCLE_A` — all within 8 hours, with 94% of the money preserved. The cycle detector flags 3–5 hop loops that keep ≥60% of funds for ≤30 days and scores this one 0.95, emitting a **high** `round_tripping_cycle` signal on every subject whose account sits on the path.
2. **One owner, two identities.** Both records share the same phone, tax ID (`SSN-000-88-7777`), device fingerprint (`DEV-FINGERPRINT-X99`), and address. Entity resolution weights shared identifiers — document number 1.0, tax ID 0.95, device 0.85, phone 0.8, email 0.75, IP 0.65, address 0.55 — and above the 0.65 threshold the pair resolves into one identity cluster at 99% confidence: a **medium** `entity_resolution_cluster` signal. The company is not a second customer; it is the same beneficial owner on the other side of the loop.
3. **The hub.** `ACC_CYCLE_B` ranks among the graph's top PageRank hubs (0.284), so its signatory also receives a **high** `high_centrality_account` signal naming the account's flow-hub role.
4. **The verdict.** The company's report sums to 88/100 — **critical** (≥70 critical, ≥45 high, ≥25 medium, ≥10 low) with "review the signals and consider escalation". A customer whose accounts touch none of the patterns instead gets only the informational `no_active_typologies` signal: 3/100, clean.

The same detector run covers structuring (fan-in/fan-out below the $10,000 reporting threshold), scatter-gather mule layering, and distance-decayed sanctions exposure (0.65 decay per hop, up to 4 hops), so the reviewer sees the whole picture before approving.

### Core AML typologies and graph algorithms

The `@open-kyc/falkordb-aml` engine executes deterministic graph-theoretic detectors directly against FalkorDB:

#### 1. Entity resolution and synthetic identity clustering (`entityResolution.ts`)

Fraud rings and bad actors often submit multiple applications using borrowed, synthetic, or altered credentials. Rather than checking fields in isolation, the detector queries for shared identifier anchors:

```cypher
MATCH (p1:Person)-[:HAS_IDENTIFIER]->(i:Identifier)<-[:HAS_IDENTIFIER]-(p2:Person)
WHERE p1.id < p2.id
RETURN p1.id AS p1_id, p2.id AS p2_id, collect(i.type) AS shared_types, collect(i.val) AS shared_vals
```

Shared attributes carry deterministic weights:
- `documentNumber`: **1.0**
- `taxId`: **0.95**
- `deviceId`: **0.85**
- `phone`: **0.80**
- `email`: **0.75**
- `ip`: **0.65**
- `address`: **0.55**

When the cumulative pairwise similarity meets or exceeds the `0.65` threshold, the identities resolve into a unified cluster.

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

#### 2. Circular flow and round-tripping cycle detection (`cycleDetection.ts`)

Launderers route money through international shell entities and layered trusts only to return the funds to the initial beneficial owner, creating a legitimate appearance of commercial revenue. The detector checks for 3-hop, 4-hop, and 5-hop directed cycles:

```cypher
MATCH (a:Account)-[t1:TRANSFERRED]->(b:Account)-[t2:TRANSFERRED]->(c:Account)-[t3:TRANSFERRED]->(a:Account)
WHERE a.id < b.id AND a.id < c.id AND b.id <> c.id
RETURN a.id AS a_id, b.id AS b_id, c.id AS c_id, t1, t2, t3
```

Cycles are flagged if:
1. **Duration**: Min-to-max transfer timestamp delta is $\le 720\text{ hours}$ (30 days).
2. **Fund preservation**: At least $60\%$ of the initial capital survives round-trip transaction fees ($\text{returnedAmt} / \text{initialAmt} \ge 0.60$).

```mermaid
graph LR
  A["Account A (AlphaBank, Cayman)"]
  B["Account B (BetaFinancial, Panama)"]
  C["Account C (BVI Trust)"]

  A -->|"1. $50,000 (t0)"| B
  B -->|"2. $48,500 (t0 + 3h)"| C
  C -->|"3. $47,000 (t0 + 8h)"| A
```

#### 3. Smurfing and structuring (`smurfing.ts`)

Statutory rules (such as Bank Secrecy Act Currency Transaction Reports) mandate filing when cash transactions reach $10,000. Bad actors evade detection by breaking payments into sub-threshold increments ($5,000–$9,999):

- **Fan-In (Accumulation)**: Multiple origin accounts transfer sub-threshold amounts into one collector account within a 72-hour window.
- **Fan-Out (Dispersion)**: A single origin account disperses sub-threshold payments across multiple beneficiaries.

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

#### 4. Scatter-gather mule layering (`scatterGather.ts`)

To break direct linear audits, a source account splits capital across $N$ intermediary money-mule accounts, which promptly recombine at a single destination account within 24–72 hours:

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

#### 5. PageRank and flow hub centrality (`centrality.ts`)

FalkorDB's embedded GraphBLAS engine calculates global network centrality across all accounts via `CALL algo.pageRank('Account', 'TRANSFERRED')`. By cross-referencing PageRank with the inbound-to-outbound volume flow ratio, accounts are categorized into functional operational roles:

- **Funnel Aggregator** ($\text{In/Out Ratio} > 3.0$): Funnel accounts gathering funds from many depositors.
- **Dispersion Source** ($\text{In/Out Ratio} < 0.33$): Primary distribution accounts feeding mule layers.
- **Transit Hub** (High PageRank, balanced In/Out): High-velocity pass-through conduit accounts.

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

#### 6. Distance-decayed sanctions exposure tracing (`riskTracing.ts`)

Direct sanctions screening only checks the immediate account holder. Launderers evade direct hits by introducing 1 to 4 intermediary entities. OpenKYC traverses directed transfer paths up to 4 hops away from known Office of Foreign Assets Control (OFAC) Specially Designated Nationals (SDNs) or Politically Exposed Persons (PEPs):

$$\text{Exposure Score} = \text{BaseRisk} \times 0.65^{\text{hops}}$$

- **1 Hop**: $65.0\%$ exposure
- **2 Hops**: $42.3\%$ exposure
- **3 Hops**: $27.5\%$ exposure
- **4 Hops**: $17.9\%$ exposure

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

### Detecting a North Korean IT worker in your organization

North Korean IT workers take remote positions under falsified — often stolen — identities, appear domestic by working through third-party "laptop farms", and route their salaries (frequently in cryptocurrency) to DPRK front companies. Paying them can violate sanctions law: UNSCR 2397 requires repatriating DPRK nationals earning income in your jurisdiction, FATF keeps the DPRK on its call-for-action blacklist, and OFAC designates the front companies that collect the revenue.

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

Every person in the graph is scored against eight weighted indicators modeled on the July 2026 multi-government advisory:

| Indicator | Points | What OpenKYC checks |
| --- | --- | --- |
| I1 DPRK identity claim | 40 | Registered nationality is North Korean / DPRK. |
| I2 Third-party identity reuse | 25 | Tax ID or document number already attached to another profile. |
| I3 Laptop-farm infrastructure | 25 | Device fingerprint or IP shared across distinct identities. |
| I4 DPRK IP range | 30 | Sessions originating from 175.45.176.0/24, the DPRK-allocated block. |
| I5 Crypto remittance demand | 20 | Income received via crypto exchange/swap instead of payroll. |
| I6 Front-company remittance | 35 | Outbound funds to OFAC-designated fronts (Korea Osong Shipping Co, Chonsurim Trading Corporation, Liaoning China Trade Industry). |
| I7 Proxy-jurisdiction accounts | 15 | Accounts domiciled in PRK/CHN/RUS/LAO/VNM that do not match the claimed nationality. |
| I8 Multi-source income | 10 | Paid by two or more concurrent employers at $10,000 or more each. |

Scores (summed weights, capped at 100) map to actions:

| Score | Level | Action |
| --- | --- | --- |
| ≥75 | critical | Suspend or terminate the engagement; screen every profile sharing the identifier cluster; prepare sanctions escalation under UNSCR 2397 / OFAC. |
| ≥45 | high | Escalate to sanctions compliance; verify identity in person; suspend payment channels pending review. |
| ≥20 | medium | Enhanced due diligence: in-person video verification, employer-side IP/device audit, monitor remittance destinations. |
| <20 | clean | Monitor. |

The session's report carries three DPRK signals: `dprk_it_worker_indicator` (high at ≥45) with the top indicator codes, `dprk_shared_infrastructure` (high for IP, medium for device) naming the peers the operative shares infrastructure with, and `dprk_front_company_remittance` (high) when salary is routed onward to a designated front.

`npm run demo:seed` runs the scenario end to end: two operatives (Grace Miller, Daniel Cooper) claim US identities but share one laptop-farm device fingerprint and submit from the DPRK-allocated IP range, next to two legitimate customers. The operatives report critical (≈100/100) with both DPRK signals; the customers stay clean (3/100). `npm run test:e2e-screening` asserts exactly that outcome. See [Demo data and DPRK screening](demo-data-e2e.md) for the pipeline trace.

No graph evidence is needed to notice the human red flags either: the payroll account holder does not match the worker, offers arrive below market rate, ID photos or live video feeds fail verification, and sessions log unnaturally long hours in a UTC+9 working pattern.

## Graph retrieval (GraphRAG) with FalkorDB

The compliance chat at `/agent` answers from a knowledge graph — graph retrieval-augmented generation (GraphRAG) implemented in-process, with no external GraphRAG framework or Python service. FalkorDB speaks the Redis protocol, so the API talks to it directly through `@open-kyc/falkordb-aml` (`packages/falkordb-aml/`), an ioredis-based client used for ingestion, the AML algorithms, and retrieval alike.

### Deployment

Compose runs `falkordb/falkordb:latest` with a persistent volume and a `redis-cli ping` health check. Defaults point at the local container (`127.0.0.1:6380`); inside Compose the API connects to `falkordb:6379`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FALKORDB_BIND` | `127.0.0.1` | Host interface the container publishes on |
| `FALKORDB_PORT` | `6380` | Published port; the API's client port (`6379` for the API container inside Compose) |
| `FALKORDB_HOST` | `127.0.0.1` (`falkordb` inside Compose) | Client host |
| `FALKORDB_GRAPH` | `openkyc_aml` | Graph name |
| `FALKORDB_PASSWORD` | unset | Optional authentication |

The graph is inspectable over the Redis protocol: `redis-cli -p 6380 GRAPH.QUERY openkyc_aml "MATCH (p:Person) RETURN count(p)"`.

### What ingestion writes

When a session completes, the OCR results are ingested with deterministic Cypher (`server/aml/ocr-to-graph.ts`):

| Node or edge | Contents |
| --- | --- |
| `:Person` | The subject — node id is the session id |
| `:Document` | One per uploaded file (`doc_<sessionId>_<fileId>`): document type, extracted number, financial attributes |
| `:Identifier` | Normalized anchors — document number, tax id, address, email, phone, IP, device fingerprint |
| `:Account` | Accounts found in statements, bills, and invoices |
| Edges | `SUBMITTED_DOCUMENT`, `HAS_IDENTIFIER`, `OWNS {role}` from the subject |

Shared `:Identifier` nodes are what connect separate subjects, which is the substrate for entity resolution and laptop-farm detection.

### Embeddings and vector indexes

At ingestion, each `:Document` and `:Person` node also receives an `embedding` property: its business fields are rendered as deterministic text (sorted `key: value` pairs), embedded with `nvidia/nemotron-3-embed-1b` (2048-dim) over the NVIDIA NIM endpoint, and stored as a `vecf32` vector (`server/aml/graph-vectors.ts`). The first vectors create one cosine vector index per label:

```
CREATE VECTOR INDEX FOR (n:Document) ON (n.embedding) OPTIONS {dimension: 2048, similarityFunction: 'cosine'}
```

Embedding is best-effort: without `NVIDIA_API_KEY`, or when the provider fails, ingestion and AML scoring continue and retrieval falls back to keyword matching. `NVIDIA_EMBED_MODEL` overrides the embedding model.

### How the chat retrieves

`server/ai/retrieval/` routes each question deterministically — the LLM never picks its own tools — and fans retrieval out across sources, streaming each step to the UI:

| Retriever | Source | Returns |
| --- | --- | --- |
| `search_entities` | PostgreSQL + benchmark graph | Subject and entity anchors for the question |
| `analyze_employee_compliance` | Employee knowledge base | Staff roles, clearances, and compliance flags |
| `run_aml_algorithms` | FalkorDB | A live detector run (cycles, structuring, scatter-gather, entity resolution, centrality, sanction tracing, DPRK screening) formatted as cited signals |
| `search_documents` | FalkorDB | Semantic matches from `db.idx.vector.queryNodes` over `:Document`/`:Person` vectors, or keyword matches when vectors are unavailable |

Chunk ids are stable (`aml:graph:cycle_detection`, `doc:graph:semantic`, `doc:graph:records`, `kyc:db:<id>`, `staff:<id>`, …), so every answer cites the graph evidence behind it. When FalkorDB is unreachable the graph retriever answers from bundled benchmark snapshots and document search returns nothing, keeping AML answers grounded without claiming live data.

## Scope

- Collected documents require manual review. AML reports assist operators; they do not auto-approve.
- Face matching, document authenticity decisions, and malware scanning are not implemented.
- Compose targets a single host, not a high-availability cluster.

## Documentation

| Document | Covers |
| --- | --- |
| [System architecture](docs/system.md) | Runtime components, data model, collection flow |
| [Deployment and operations](docs/self-hosting.md) | Setup, HTTPS, backups, upgrades |
| [Storage providers](docs/storage.md) | Local disk, S3, GCS, R2 configuration |
| [Developer API](docs/api.md) | Endpoints, upload limits, webhook signatures |
| [Data migration](docs/migration.md) | Importing existing Convex data |
| [Demo data and DPRK screening](demo-data-e2e.md) | Sample data seeding, end-to-end screening test |
| [Original design (archive)](docs/legacy-readme.md) | Convex-era README and v2 plan |

## Development

Start the backing services, apply migrations, and run both dev servers with one command:

```sh
npm run dev:all
```

Vite serves the frontend on port 3000 and proxies `/api` to the API on port 3001. Run `docker compose stop app` first if the Compose stack holds port 3000.

Run checks:

```sh
npm run build            # frontend build and TypeScript check
npm test                 # access-control and storage unit tests
npm run test:integration # API integration tests against a running deployment
npm run test:e2e         # browser tests for collection, review, authoring
npm run test:e2e-screening # end-to-end OCR, graph, and AML pipeline
npm run demo:seed        # sample workflows and DPRK screening scenario
```

Set `TEST_BASE_URL` to target another development deployment. Integration and browser tests create their own accounts and fixtures.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | React SPA: dashboard, collection pages, forms |
| `server/` | Express API, auth, OCR, AML pipeline, agent, webhooks |
| `packages/` | Shared UI, typed contracts, `falkordb-aml` graph library |
| `docs/` | Architecture, deployment, storage, API, migration |
| `openui-agent/` | Standalone generative-UI chat experiment (OpenUI) |
