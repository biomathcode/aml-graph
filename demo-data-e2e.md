# Demo data & end-to-end DPRK screening pipeline

Two npm scripts drive the **real verification pipeline over HTTP** (no DB
fixtures) — the same flow an operator and subject use in the app:

```
workflow created by operator
        ↓  sessions.create (public token)
subject submits identity form + passport scan
        ↓  sessions.update (status=completed) enqueues jobs
OCR job  → Indra OCR service (falls back to local Tesseract ensemble)
         → ocrExtractedFields on the session
AML job  → ingestOcrIntoGraph (:Person/:Document/:Identifier/:Account)
         → embedSessionGraph (nvidia/nemotron-3-embed-1b → vecf32 vectors + cosine indexes)
         → buildGraphAmlReport (graph algorithms incl. nk_worker)
         → amlRisk / amlRiskAt + graphStatus / amlStatus on the session
        ↓
operator reviews AML risk report in /verifications/<id>
```

## Sample data

`npm run demo:seed` — idempotent sample-data seeding:

1. Renders OCR-able synthetic passport scans into `tests/fixtures/`
   (`scripts/gen-demo-documents.ts`, uses the project's Playwright Chromium —
   valid-position TD3 MRZ so both OCR engines extract the fields).
2. Signs up/in a demo operator (`demo-operator@openkyc.dev` /
   `DemoOperator-2026-pass!`).
3. Creates two sample workflows:
   - **Standard Customer KYC Onboarding** — id_verification, address_check,
     document_validation.
   - **Employee & Contractor DPRK Screening** — adds the ip_analysis step.
     (Workflows created before the workflow-driven collector are upgraded with
     the `address_check` step on re-runs.)
4. Submits four subjects, walking each workflow's steps exactly like the
   public collector (`src/routes/sessions/$sessionid.tsx`): the
   id_verification step stores the **identity hints** (`identity` object,
   OCR of the document stays authoritative), the address_check step stores a
   **residential address** (run-unique; the two operatives share one anchor
   address, mirroring the laptop-farm apartment typology), the front-image
   slot closes `document_validation`, and `completed_steps` records the
   workflow-step keys so the collector can resume mid-flow.

| Subject        | Kind     | Story                                                  |
| -------------- | -------- | ------------------------------------------------------ |
| Michael Torres | customer | Legitimate US customer — stays `clean`.                |
| Nora Larsen    | customer | Legitimate Canadian customer — stays `clean`.          |
| Grace Miller   | employee | DPRK remote-worker operative on falsified US identity. |
| Daniel Cooper  | employee | Sits on the same laptop farm as Grace.                 |

The operatives share a device fingerprint (`DEV-LAPTOP-FARM-22-<run>`) and
submit from a DPRK-allocated IP (`175.45.176.0/24`); connection IPs are
captured server-side from the edge header during submission. Identifiers are
**run-unique** (document numbers, emails, devices, IPs regenerate per run)
because the knowledge graph persists across runs — only the laptop-farm
affinity stays stable so it exercises the DPRK indicators (I3/I4).

5. Waits for each OCR → graph → AML pass, prints a report, and (for
   employees) re-runs AML after the peer was ingested so the shared
   device/IP collision is reflected in **both** reports.

Expected outcome: customers `clean (3/100)`; operatives `critical (≈100/100)`
with `dprk_it_worker_indicator` + `dprk_shared_infrastructure` signals.

## End-to-end test

`npm run test:e2e-screening` — asserts the full pipeline:
OCR completion, graph ingestion, field extraction, and that the operatives
flag `high`/`critical` with both DPRK signal types while the customers stay
unflagged.

Requires the stack running (`npm run dev:all`), e.g.:

```
DEMO_BASE_URL=http://localhost:3001 DEMO_ORIGIN=http://localhost:3000 npm run test:e2e-screening
```

## Notes

- `documents/scan` quality: Indra OCR answers 200 even when its model lacks
  weights, so `callIndraOCR` always cross-checks a schema-driven local
  Tesseract pass and keeps the higher-quality value per field
  (`indra-ocr+local-fallback`). The local pass also understands printed
  passport labels ("Surname"/"Given Names") and parses a lone MRZ line 2
  when line 1 is unreadable.
- `aml.retrySession` re-runs graph ingestion + scoring for a session — for
  example after a second session sharing the subject's device/IP arrives.
- The AML job loop (kind `aml`) is owned by the API process and talks to
  FalkorDB directly over the Redis protocol; without a reachable FalkorDB the
  session settles with `graphStatus=unavailable` / `amlStatus=unavailable`
  instead of blocking the pipeline.
- Graph embeddings are best-effort: without `NVIDIA_API_KEY` (or when the NIM
  embedding call fails) ingestion and AML scoring still complete and the
  agent's document retrieval falls back to keyword matching.
- AML risk scores are graph-native (0–100); the review view renders them on
  one displayed scale.
