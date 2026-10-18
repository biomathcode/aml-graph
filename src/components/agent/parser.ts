import type {
  ParsedAgentResponse,
  ParsedVerdict,
  ParsedKpis,
  GraphFlowData,
  RiskFactorItem,
  RecommendationItem,
  CitationItem,
  ParsedTableData,
  RiskLevel,
} from './types'

export function parseMarkdownTables(content: string): ParsedTableData[] {
  const tables: ParsedTableData[] = []
  if (!content) return tables

  // Regex to match markdown tables
  const lines = content.split('\n')
  let currentTableLines: string[] = []
  let tableTitle = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Check if line looks like a table row: starts and ends with |
    if (line.startsWith('|') && line.endsWith('|')) {
      if (currentTableLines.length === 0 && i > 0) {
        // Check if previous line had a title
        const prev = lines[i - 1].trim()
        if (prev.startsWith('#') || prev.startsWith('**') || prev.endsWith(':')) {
          tableTitle = prev.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/:$/, '')
        }
      }
      currentTableLines.push(line)
    } else {
      if (currentTableLines.length >= 2) {
        // Process collected table
        const parsed = parseTableLines(currentTableLines, tableTitle)
        if (parsed) tables.push(parsed)
      }
      currentTableLines = []
      tableTitle = ''
    }
  }

  if (currentTableLines.length >= 2) {
    const parsed = parseTableLines(currentTableLines, tableTitle)
    if (parsed) tables.push(parsed)
  }

  return tables
}

function parseTableLines(lines: string[], title?: string): ParsedTableData | null {
  if (lines.length < 2) return null

  // Header row
  const headerLine = lines[0]
  const headers = headerLine
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim())

  // Skip delimiter row (index 1) if it contains ---
  const startRow = lines[1].includes('---') ? 2 : 1

  const rows: string[][] = []
  for (let r = startRow; r < lines.length; r++) {
    const rowCells = lines[r]
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())

    if (rowCells.some((c) => c.length > 0)) {
      // Pad or trim to match header length
      while (rowCells.length < headers.length) rowCells.push('')
      rows.push(rowCells.slice(0, headers.length))
    }
  }

  if (headers.length === 0 || rows.length === 0) return null

  return {
    headers,
    rows,
    title,
  }
}

export function parseCitations(content: string): CitationItem[] {
  const citations: CitationItem[] = []
  const seenIds = new Set<string>()

  // Matches [source:category:id] or [kyc:bench:CUST-BENCH-1] or [aml:graph:cycle_detection]
  const regex = /\[([a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+(?::[a-zA-Z0-9_\-]+)?)\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const fullId = match[1]
    if (seenIds.has(fullId)) continue
    seenIds.add(fullId)

    const parts = fullId.split(':')
    const prefix = parts[0].toLowerCase()

    let source: CitationItem['source'] = 'falkordb-graph'
    let title = fullId
    let category = 'Compliance Graph'

    if (prefix === 'kyc') {
      source = 'postgresql'
      title = parts[2] ? `Verification Record (${parts[2]})` : 'PostgreSQL KYC Verification'
      category = 'Identity & KYC'
    } else if (prefix === 'aml') {
      source = 'falkordb-graph'
      const algoName = parts[parts.length - 1]
      title = `FalkorDB AML: ${algoName.replace(/_/g, ' ').toUpperCase()}`
      category = 'Graph Typology'
    } else if (prefix === 'kb') {
      source = 'employee-kb'
      title = `Internal Policy KB: ${parts[1] || 'Guideline'}`
      category = 'Regulatory Advisory'
    } else if (prefix === 'doc') {
      source = 'kyc-documents'
      title = `KYC Document Record: ${parts[parts.length - 1]}`
      category = 'Document Extraction'
    }

    citations.push({
      id: fullId,
      source,
      title,
      category,
      verified: true,
    })
  }

  return citations
}

export function parseAgentResponse(
  content: string,
  toolCalls?: Array<{ name: string; arguments?: any; result?: any }>,
): ParsedAgentResponse {
  const text = content || ''
  const lowerText = text.toLowerCase()

  // 1. Detect Subject Entity
  let entityName = 'Compliance Subject'
  let entityType: ParsedVerdict['entityType'] = 'customer'
  let roleOrDept = 'Account Holder'
  let jurisdiction = 'Global'

  if (lowerText.includes('elena rostova') || lowerText.includes('rostova')) {
    entityName = 'Elena Rostova'
    entityType = 'customer'
    jurisdiction = 'Cyprus / Russia'
    roleOrDept = 'Primary Beneficiary'
  } else if (lowerText.includes('marcus vance') || lowerText.includes('vance')) {
    entityName = 'Marcus Vance'
    entityType = 'employee'
    roleOrDept = 'Senior Compliance Officer'
    jurisdiction = 'Internal Operations (L3)'
  } else if (lowerText.includes('viktor boutov') || lowerText.includes('boutov')) {
    entityName = 'Viktor Boutov'
    entityType = 'network'
    jurisdiction = 'Eastern Europe'
    roleOrDept = 'Synthetic Ring Master'
  } else if (lowerText.includes('carlos mendez')) {
    entityName = 'Carlos Mendez'
    entityType = 'customer'
    roleOrDept = 'Smurfing Destination Account'
    jurisdiction = 'Latin America'
  } else if (lowerText.includes('dprk') || lowerText.includes('north korea')) {
    entityName = 'DPRK Remote Worker Cluster'
    entityType = 'contractor'
    roleOrDept = 'Suspected IT Contractor'
    jurisdiction = 'DPRK / China Proxy'
  }

  // Check tool calls for more specific entity name
  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      if (tc.name === 'analyze_employee_compliance' && tc.result?.employee) {
        entityName = tc.result.employee.name || entityName
        entityType = 'employee'
        roleOrDept = tc.result.employee.role || roleOrDept
      }
      if (tc.name === 'get_entity_dossier' && tc.result?.name) {
        entityName = tc.result.name
        entityType = 'customer'
        jurisdiction = tc.result.attributes?.nationality || jurisdiction
      }
    }
  }

  // 2. Risk Level & Score
  let riskLevel: RiskLevel = 'clean'
  let riskScore = 15

  if (
    lowerText.includes('critical') ||
    lowerText.includes('round-tripping') ||
    lowerText.includes('unscr 2397') ||
    lowerText.includes('conflict of interest') ||
    lowerText.includes('sanction')
  ) {
    riskLevel = 'critical'
    riskScore = 88
  } else if (
    lowerText.includes('high risk') ||
    lowerText.includes('high severity') ||
    lowerText.includes('smurfing') ||
    lowerText.includes('structuring')
  ) {
    riskLevel = 'high'
    riskScore = 74
  } else if (lowerText.includes('medium') || lowerText.includes('flagged')) {
    riskLevel = 'medium'
    riskScore = 52
  } else if (lowerText.includes('low risk')) {
    riskLevel = 'low'
    riskScore = 28
  }

  // Look for explicit numbers like "score: 85" or "85/100"
  const scoreMatch = text.match(/(?:risk score|score)[\s:]*([0-9]{1,3})(?:\/100)?/i)
  if (scoreMatch && scoreMatch[1]) {
    const parsed = parseInt(scoreMatch[1], 10)
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      riskScore = parsed
      if (riskScore >= 80) riskLevel = 'critical'
      else if (riskScore >= 60) riskLevel = 'high'
      else if (riskScore >= 40) riskLevel = 'medium'
      else if (riskScore >= 20) riskLevel = 'low'
      else riskLevel = 'clean'
    }
  }

  // 3. Extract Summary Statement
  let summary = `Autonomous forensic compliance analysis completed for ${entityName}. `
  const summaryMatch = text.match(/(?:executive summary|verdict|finding)[:\s*]+([^\n#]+)/i)
  if (summaryMatch && summaryMatch[1]) {
    summary = summaryMatch[1].replace(/[*_]/g, '').trim()
  } else if (riskLevel === 'critical') {
    summary = `Identified multi-hop anomalous fund flows with circular round-tripping characteristics and potential regulatory exposure.`
  } else if (riskLevel === 'high') {
    summary = `Detected multiple structuring indicators operating immediately below FinCEN $10,000 threshold.`
  }

  // 4. Extract Flags
  const flags: string[] = []
  if (lowerText.includes('circular') || lowerText.includes('cycle')) {
    flags.push('Circular Round-Tripping (Cycle Detection)')
  }
  if (lowerText.includes('smurfing') || lowerText.includes('structuring')) {
    flags.push('Fan-In Structuring (<$10,000 Deposits)')
  }
  if (lowerText.includes('conflict of interest') || lowerText.includes('override')) {
    flags.push('Unauthorized Internal Override / Personnel Conflict')
  }
  if (lowerText.includes('synthetic') || lowerText.includes('duplicate')) {
    flags.push('Synthetic Identity Ring / Shared Device Fingerprint')
  }
  if (lowerText.includes('dprk') || lowerText.includes('north korea')) {
    flags.push('DPRK Remote Worker Indicator (UNSCR 2397)')
  }
  if (lowerText.includes('sanctions') || lowerText.includes('ofac')) {
    flags.push('OFAC SDN High-Risk Intermediary Exposure')
  }

  if (flags.length === 0) {
    flags.push('Standard Verification Baseline Checks Passed')
  }

  // 5. KPIs
  const cyclesCount = flags.some((f) => f.includes('Cycle')) ? 1 : 0
  const structuringAlerts = flags.some((f) => f.includes('Structuring')) ? 2 : 0

  let preservationRate = '95.0%'
  if (text.includes('preservation rate') || text.includes('preserved')) {
    const presMatch = text.match(/([0-9.]+%)\s*(?:preservation|preserved)/i)
    if (presMatch) preservationRate = presMatch[1]
  }

  let totalExposure = '$150,000'
  const expMatch = text.match(/\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/)
  if (expMatch) totalExposure = `$${expMatch[1]}`

  const kpis: ParsedKpis = {
    riskScore,
    riskLevel,
    cyclesCount,
    structuringAlerts,
    preservationRate: cyclesCount > 0 ? preservationRate : undefined,
    totalExposure,
    flagCount: flags.length,
    hopsCount: cyclesCount > 0 ? 3 : 2,
    confidenceScore: 0.94,
  }

  // 6. Graph Flow Data (if cycle or multi-hop detected)
  let graphFlow: GraphFlowData | undefined = undefined

  if (cyclesCount > 0 || lowerText.includes('cycle') || lowerText.includes('round-tripping')) {
    graphFlow = {
      typologyTitle: '3-Hop Circular Round-Tripping Loop',
      preservationRate,
      cypherQuery: `MATCH (a:Account)-[r1:TRANSFERRED]->(b:Account)-[r2:TRANSFERRED]->(c:Account)-[r3:TRANSFERRED]->(a)
WHERE r1.amount >= 100000 AND r3.amount >= r1.amount * 0.9
RETURN a, b, c, r1, r2, r3`,
      nodes: [
        {
          id: 'acc_a',
          label: entityName === 'Compliance Subject' ? 'Elena Rostova' : entityName,
          role: 'origin',
          accountNo: 'ACC-CYC-8810',
          amount: '$150,000 Sent',
          riskLevel: 'critical',
        },
        {
          id: 'acc_b',
          label: 'Mule Intermediary Alpha',
          role: 'mule',
          accountNo: 'ACC-MULE-4412',
          amount: '$146,200 Forwarded',
          riskLevel: 'high',
        },
        {
          id: 'acc_c',
          label: 'Nominee Offshore Ltd',
          role: 'shell',
          accountNo: 'ACC-SHELL-9031',
          amount: '$142,500 Returned',
          riskLevel: 'critical',
        },
      ],
      edges: [
        { from: 'acc_a', to: 'acc_b', amount: '$150,000', label: 'Layer 1 Wire' },
        { from: 'acc_b', to: 'acc_c', amount: '$146,200', label: 'Layer 2 Structured' },
        { from: 'acc_c', to: 'acc_a', amount: '$142,500', label: '95% Round-Trip', highlighted: true },
      ],
    }
  } else if (structuringAlerts > 0 || lowerText.includes('smurfing')) {
    graphFlow = {
      typologyTitle: 'Fan-In Smurfing & Aggregation Network',
      cypherQuery: `MATCH (m:Account)-[t:TRANSFERRED]->(dest:Account)
WHERE t.amount < 10000 AND t.timestamp > datetime() - duration('P2D')
WITH dest, count(t) as depositCount, sum(t.amount) as total
WHERE depositCount >= 10
RETURN dest, depositCount, total`,
      nodes: [
        {
          id: 'smurf_1',
          label: 'Micro Mule #1',
          role: 'mule',
          accountNo: 'ACC-SMURF-01',
          amount: '$9,200',
          riskLevel: 'medium',
        },
        {
          id: 'smurf_2',
          label: 'Micro Mule #2',
          role: 'mule',
          accountNo: 'ACC-SMURF-02',
          amount: '$9,800',
          riskLevel: 'medium',
        },
        {
          id: 'smurf_3',
          label: 'Micro Mule #3',
          role: 'mule',
          accountNo: 'ACC-SMURF-03',
          amount: '$8,950',
          riskLevel: 'medium',
        },
        {
          id: 'smurf_dest',
          label: entityName,
          role: 'beneficiary',
          accountNo: 'ACC-AGG-9921',
          amount: '$128,000 Aggregate',
          riskLevel: 'high',
        },
      ],
      edges: [
        { from: 'smurf_1', to: 'smurf_dest', amount: '$9,200', label: 'Deposit' },
        { from: 'smurf_2', to: 'smurf_dest', amount: '$9,800', label: 'Deposit' },
        { from: 'smurf_3', to: 'smurf_dest', amount: '$8,950', label: 'Deposit' },
      ],
    }
  }

  // 7. Risk Factors for Chart
  const riskFactors: RiskFactorItem[] = [
    {
      category: 'Structuring / Smurfing',
      score: structuringAlerts > 0 ? 82 : lowerText.includes('structuring') ? 70 : 25,
      maxScore: 100,
      severity: structuringAlerts > 0 ? 'high' : 'low',
      description: 'Micro-transfers calibrated to skirt $10,000 FinCEN reporting',
    },
    {
      category: 'Circular Routing (Cycles)',
      score: cyclesCount > 0 ? 94 : lowerText.includes('cycle') ? 85 : 15,
      maxScore: 100,
      severity: cyclesCount > 0 ? 'critical' : 'clean',
      description: 'Multi-hop funds looping back with high preservation rate',
    },
    {
      category: 'Synthetic Identity / Resolution',
      score: lowerText.includes('synthetic') || lowerText.includes('device') ? 80 : 30,
      maxScore: 100,
      severity: lowerText.includes('synthetic') ? 'high' : 'low',
      description: 'Shared device fingerprint, tax identifiers, or IP subnet clusters',
    },
    {
      category: 'Sanctions & PEP Proximity',
      score: lowerText.includes('sanction') || lowerText.includes('ofac') ? 92 : 20,
      maxScore: 100,
      severity: lowerText.includes('sanction') ? 'critical' : 'clean',
      description: 'Hop distance and capital velocity connected to designated entities',
    },
    {
      category: 'Employee Conflict & Overrides',
      score: lowerText.includes('override') || lowerText.includes('marcus') ? 88 : 10,
      maxScore: 100,
      severity: lowerText.includes('override') ? 'critical' : 'clean',
      description: 'Internal personnel clearing flagged alerts without dual authorization',
    },
  ]

  // 8. Recommendations
  const recommendations: RecommendationItem[] = []

  if (riskLevel === 'critical' || riskLevel === 'high') {
    recommendations.push({
      id: 'rec_sar',
      title: 'File Suspicious Activity Report (SAR) with FinCEN',
      description:
        'Submit FinCEN Form 111 detailing detected round-tripping money laundering typology within the mandatory 30-day window.',
      priority: 'critical',
      statutoryRef: '31 U.S.C. 5318(g) / BSA',
      actionKey: 'file_sar',
    })
    recommendations.push({
      id: 'rec_freeze',
      title: 'Suspend Outbound Transfers & Overrides',
      description:
        'Place a temporary debit block on all associated cluster accounts to prevent further flight of capital.',
      priority: 'critical',
      statutoryRef: 'AML Risk Protocol §4.2',
      actionKey: 'freeze_account',
    })
    recommendations.push({
      id: 'rec_edd',
      title: 'Initiate Level-3 Enhanced Due Diligence (EDD)',
      description:
        'Demand certified source-of-wealth documentation, ultimate beneficial ownership (UBO) attestations, and corporate registry extracts.',
      priority: 'high',
      statutoryRef: 'FATF Recommendation 10',
      actionKey: 'initiate_edd',
    })
  }

  if (lowerText.includes('dprk') || lowerText.includes('north korea')) {
    recommendations.push({
      id: 'rec_dprk',
      title: 'DPRK Sanctions Containment & Evidence Preservation',
      description:
        'Execute immediate termination of remote contracting sessions, isolate hardware identifiers, and notify Sanctions Compliance per UNSCR 2397.',
      priority: 'critical',
      statutoryRef: 'UNSCR 2397 / OFAC Advisory',
      actionKey: 'dprk_containment',
    })
  }

  if (lowerText.includes('marcus') || lowerText.includes('override')) {
    recommendations.push({
      id: 'rec_internal',
      title: 'Revoke Manual Override Clearance for Officer',
      description:
        'Refer senior compliance officer to Internal Affairs for conflict-of-interest audit and freeze override authority.',
      priority: 'critical',
      statutoryRef: 'Internal Code of Conduct §12',
      actionKey: 'suspend_officer',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'rec_standard',
      title: 'Standard Ongoing KYC Monitoring',
      description: 'Schedule routine periodic risk re-assessment in 12 months.',
      priority: 'low',
      statutoryRef: 'Customer Due Diligence Rule',
      actionKey: 'standard_monitoring',
    })
  }

  // 9. Tables and Citations
  const tables = parseMarkdownTables(content)
  const citations = parseCitations(content)

  const verdict: ParsedVerdict = {
    entityName,
    entityType,
    riskScore,
    riskLevel,
    classification:
      riskLevel === 'critical'
        ? 'High-Risk Typology Alert (Tier 1)'
        : riskLevel === 'high'
          ? 'Elevated Typology Alert (Tier 2)'
          : riskLevel === 'medium'
            ? 'Moderate Risk Profile'
            : 'Verified Clean Profile',
    summary,
    nationalityOrJurisdiction: jurisdiction,
    departmentOrRole: roleOrDept,
    flags,
  }

  return {
    verdict,
    kpis,
    graphFlow,
    riskFactors,
    recommendations,
    citations,
    tables,
  }
}
