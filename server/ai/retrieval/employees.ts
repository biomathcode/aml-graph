/**
 * Employee knowledge base retriever.
 * Retrieves internal staff profiles plus conflict-of-interest audit context.
 */

import {
  EMPLOYEES_KNOWLEDGE_BASE,
  NK_IT_WORKER_INDICATORS,
  type EmployeeProfile,
} from '../knowledge.js'
import { extractQueryTerms } from './entities.js'
import type { ContextChunk } from './types.js'

const DPRK_QUERY_HINTS =
  /\b(dprk|north korea|north korean|pyongyang|laptop farm|it worker|remote worker|working for the north korean|kim jong)\b/i

function chunkFromEmployee(emp: EmployeeProfile, score: number): ContextChunk {
  const hasConflict = emp.complianceFlags.length > 0
  return {
    id: `staff:${emp.id}`,
    source: 'employee-kb',
    title: `Employee ${emp.name} — ${emp.role}`,
    content: JSON.stringify({
      employee: {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        nationality: emp.nationality,
        clearanceLevel: emp.clearanceLevel,
      },
      auditAssessment: {
        conflictRiskLevel: hasConflict ? 'HIGH' : 'LOW',
        complianceFlags: emp.complianceFlags,
        linkedAccounts: emp.linkedAccounts,
        assignedCustomers: emp.assignedCustomers,
        internalNotes: emp.internalNotes,
        recommendedNextSteps: hasConflict
          ? [
              'Suspend manual override privileges on AML alert queue',
              'Trigger independent internal affairs forensic audit of approval logs',
            ]
          : ['Maintain routine quarterly access recertification'],
      },
    }),
    score,
  }
}

export function retrieveEmployees(userQuery: string): ContextChunk[] {
  const q = extractQueryTerms(userQuery)
  const chunks: ContextChunk[] = EMPLOYEES_KNOWLEDGE_BASE.map((emp) => {
    const hay =
      `${emp.name} ${emp.role} ${emp.department} ${emp.email} ${emp.id} ${emp.assignedCustomers.join(' ')}`.toLowerCase()
    let score = 0.4
    if (q && hay.includes(q)) score = 1
    else if (q) {
      for (const token of q.split(/\s+/)) {
        if (token.length >= 3 && hay.includes(token))
          score = Math.max(score, 0.8)
      }
    }
    return chunkFromEmployee(emp, score)
  })

  // When the inquiry is DPRK-related, ground the pack with the indicator
  // library from the July 2026 joint advisory so verdicts cite real typologies.
  if (DPRK_QUERY_HINTS.test(userQuery)) {
    chunks.push({
      id: 'kb:dprk-it-worker-indicators',
      source: 'employee-kb',
      title:
        'DPRK IT-Worker Screening Indicator Library (July 2026 joint alert)',
      content: JSON.stringify(NK_IT_WORKER_INDICATORS),
      score: 0.95,
    })
  }

  return chunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}
