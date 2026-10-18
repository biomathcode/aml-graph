/**
 * Static knowledge bases for retrieval. These act as the indexed corpus
 * until a proper vector/graph index supersedes them.
 */

import { createBenchmarkAMLDataset } from '../../packages/falkordb-aml/src/dataset/ibmAMLSim.js'

export const benchmark = createBenchmarkAMLDataset()

export interface EmployeeProfile {
  id: string
  name: string
  role: string
  department: string
  email: string
  phone: string
  nationality: string
  clearanceLevel: 'Standard' | 'Elevated' | 'Executive'
  linkedAccounts: string[]
  assignedCustomers: string[]
  complianceFlags: string[]
  internalNotes: string
}

export const EMPLOYEES_KNOWLEDGE_BASE: EmployeeProfile[] = [
  {
    id: 'EMP-01',
    name: 'Marcus Vance',
    role: 'Senior Compliance Officer',
    department: 'Risk & Regulatory Compliance',
    email: 'marcus.vance@openkyc.internal',
    phone: '+1-555-0192',
    nationality: 'USA',
    clearanceLevel: 'Executive',
    linkedAccounts: ['ACC_CORP_PAYROLL'],
    assignedCustomers: ['Elena Rostova', 'Viktor Boutov', 'Dmitri Voronin'],
    complianceFlags: [
      'Frequent manual overrides on high-risk SAR alerts',
      'Shared IP subnet detected with external offshore nominee account',
    ],
    internalNotes:
      'Audit recommended: Subject approved 4 high-value wire transfers for Elena Rostova despite flagged smurfing typologies.',
  },
  {
    id: 'EMP-02',
    name: 'Sarah Lin',
    role: 'Wealth Portfolio Advisor',
    department: 'Private Banking',
    email: 'sarah.lin@openkyc.internal',
    phone: '+1-555-0348',
    nationality: 'Canada',
    clearanceLevel: 'Elevated',
    linkedAccounts: ['ACC_RETAIL_1'],
    assignedCustomers: ['Chloe Martin', 'Alexander Vance'],
    complianceFlags: [],
    internalNotes:
      'Clear compliance record. Managed private client portfolio adhering to FINCEN AML standards.',
  },
  {
    id: 'EMP-03',
    name: 'David Kim',
    role: 'Retail Branch Manager',
    department: 'Commercial Operations',
    email: 'david.kim@openkyc.internal',
    phone: '+1-555-0811',
    nationality: 'USA',
    clearanceLevel: 'Elevated',
    linkedAccounts: ['ACC_RETAIL_2'],
    assignedCustomers: ['John Doe', 'Alice Cooper'],
    complianceFlags: [
      'Account opened without mandatory secondary utility bill verification',
    ],
    internalNotes:
      'Minor KYC deficiency reported during Q3 internal compliance review.',
  },
  {
    id: 'EMP-04',
    name: 'Alex Chen',
    role: 'Commercial Underwriter',
    department: 'Corporate Lending',
    email: 'alex.chen@openkyc.internal',
    phone: '+1-555-0477',
    nationality: 'Singapore',
    clearanceLevel: 'Standard',
    linkedAccounts: ['ACC_CORP_SUPPLIER'],
    assignedCustomers: ['TechGlobal Ltd', 'Nordic Maritime BV'],
    complianceFlags: [],
    internalNotes:
      'Zero adverse findings. Regular annual AML refresher completed.',
  },
  {
    id: 'EMP-05',
    name: 'Grace Miller',
    role: 'Remote Software Engineer (Contractor)',
    department: 'Digital Delivery (Vendor-Sourced)',
    email: 'grace.miller.freel@vendorcontract.io',
    phone: '+1-555-7711',
    nationality: 'USA',
    clearanceLevel: 'Standard',
    linkedAccounts: ['ACC_LAPTOP_FARM_US'],
    assignedCustomers: [],
    complianceFlags: [
      'Device fingerprint DEV-LAPTOP-FARM-22 shared with one other workforce identity (laptop-farm pattern)',
      'Session IPs originate from 175.45.176.0/24 — range allocated to the DPRK',
      'Requested payment in USDT to an account held by a third party',
      'Claimed tax ID matches a separate approved customer profile (third-party identity reuse)',
      'Productive activity logged in fallback patterns consistent with UTC+9 working hours',
    ],
    internalNotes:
      'DPRK IT-worker screening (July 2026 joint advisory) triggered: suspected operative of the North Korean remote-worker scheme earning revenue for DPRK state agencies with weapons-program exposure. Do not proceed to permanent onboarding; preserve evidence; coordinate with sanctions compliance (UNSCR 2397 / OFAC) before any further disclosure.',
  },
]

export interface BenchmarkCustomer {
  id: string
  name: string
  documentNumber: string
  nationality: string
  status: string
  riskScore: number
  riskLevel: string
  flagReasons: string[]
  accountNumber: string
  bank: string
  balance: number
}

export const BENCHMARK_CUSTOMERS: BenchmarkCustomer[] = [
  {
    id: 'CUST-BENCH-5',
    name: 'Daniel Cooper',
    documentNumber: 'DL-AZ-441120',
    nationality: 'USA',
    status: 'suspended',
    riskScore: 97,
    riskLevel: 'critical',
    flagReasons: [
      'Screened as suspected DPRK IT worker (risk 100/100): device fingerprint DEV-LAPTOP-FARM-22 and IP 175.45.176.72 (DPRK-allocated range) shared with "Grace Miller"',
      'Salaries from >=2 employers remitted in USDT to OFAC-designated DPRK fronts (Chonsurim Trading Corporation, Korea Osong Shipping Co)',
      'Tax ID and demographic data consistent with third-party identity use; cannot pass in-person or live video verification',
      'UNSCR 2397 / FATF blacklist exposure: engagement remuneration may violate domestic sanctions law',
    ],
    accountNumber: 'ACC_LAPTOP_FARM_US',
    bank: 'First Charset National Bank',
    balance: 78000,
  },
  {
    id: 'CUST-BENCH-1',
    name: 'Elena Rostova',
    documentNumber: 'P9841203',
    nationality: 'Cyprus',
    status: 'flagged',
    riskScore: 88,
    riskLevel: 'critical',
    flagReasons: [
      '3-hop circular fund cycle detected (ACC_CYCLE_A -> ACC_CYCLE_B -> ACC_CYCLE_C -> ACC_CYCLE_A)',
      'Shared tax ID with sanctioned entity in Panama registry',
      'Adverse media: International money laundering investigation inquiry',
    ],
    accountNumber: 'ACC_CYCLE_A',
    bank: 'Bank of Cyprus',
    balance: 850000,
  },
  {
    id: 'CUST-BENCH-2',
    name: 'Carlos Mendez',
    documentNumber: 'DL-TX-88210',
    nationality: 'USA',
    status: 'flagged',
    riskScore: 76,
    riskLevel: 'high',
    flagReasons: [
      'Structured cash deposits under $10,000 (Smurfing fan-in pattern)',
      '14 rapid micro-transfers totaling $128,000 within 48 hours',
    ],
    accountNumber: 'ACC_SMURF_TARGET',
    bank: 'Chase',
    balance: 142000,
  },
  {
    id: 'CUST-BENCH-3',
    name: 'Viktor Boutov',
    documentNumber: 'RUS-881920',
    nationality: 'Bulgaria',
    status: 'rejected',
    riskScore: 95,
    riskLevel: 'critical',
    flagReasons: [
      'Direct multi-hop exposure to OFAC Specially Designated Nationals (SDN) node',
      'High PageRank centrality in illicit layering network',
    ],
    accountNumber: 'ACC_SANCTIONS_LAYER2',
    bank: 'Baltic Trust',
    balance: 1250000,
  },
  {
    id: 'CUST-BENCH-4',
    name: 'Chloe Martin',
    documentNumber: 'PASSPORT-FR-39102',
    nationality: 'France',
    status: 'approved',
    riskScore: 12,
    riskLevel: 'clean',
    flagReasons: [],
    accountNumber: 'ACC_RETAIL_1',
    bank: 'BNP Paribas',
    balance: 34500,
  },
]

/**
 * DPRK IT-worker screening indicator library.
 * Modeled on the July 31 2026 joint alert "Alert to Countries, Companies, and
 * Other Entities Regarding North Korean IT Workers" (U.S. Dept of State & FBI
 * with JP/KR/AU/CA/FR/DE/IT/NL/NZ/UK partners) and the documented North Korean
 * remote-worker scheme (laptop farms, identity theft, remittances to the DPRK
 * government / weapons programs).
 */
export const NK_IT_WORKER_INDICATORS = {
  campaignId: 'nk-it-worker-scheme',
  source:
    'Joint government alert of July 31 2026 + UNSCR 2397 + FATF blacklist',
  legalObligations: [
    'UNSCR 2397: all UN Member States must repatriate DPRK nationals earning income in their jurisdiction (limited exceptions).',
    'Contracting with / paying DPRK IT workers may violate domestic law in the U.S., Japan, ROK and partner countries.',
    'FATF designates DPRK as a high-risk jurisdiction (blacklist) — apply proliferation-financing countermeasures.',
  ],
  modusOperandi: [
    'Falsified nationality/identity: forged or third-party-provided ID documents; impersonation of real people (stolen SSNs).',
    'Third-party proxies participate in account creation, interviews and even in-person onboarding.',
    'Payment evasion: money transfer services or cryptocurrency (USDT); payments sent to a third party bank account that forwards onward for a fee.',
    '"Laptop farms": company laptops shipped to facilitator addresses (US/EU) so operatives appear domestic while controlling devices remotely (VPN/remote desktop).',
    'Operatives work in teams; the person answering may change by time of day; multiple simultaneous jobs are common.',
    'DPRK front companies (Korea Osong Shipping Co, Chonsurim Trading Corporation, Liaoning China Trade Industry — OFAC Jan 2025) collect the revenue.',
  ],
  verificationRedFlags: [
    'Photo ID mismatch or artificially generated/manipulated video feed in interviews; refusal of video interviews.',
    'Profile text with unnatural machine-translation artifacts (though operatives may use LLMs to hide this).',
    'Offers to work below market rates.',
    'Multiple accounts created from the same IP / same identification document; single account accessed from multiple IPs in a short period.',
    'Frequent changes to registered contact and banking details; payment account holder name does not match the worker.',
    'Accounts logged in unusually long, unnaturally high working-hour metrics, or suspicious self-reviews.',
    'Sessions sourcing from DPRK-allocated IP space (175.45.176.0/24).',
  ],
  knownCases: [
    'Christina Chapman (2025): US facilitator running an Arizona laptop farm serving 300+ companies, >$17M to DPRK; sentenced to 8 years.',
    'KnowBe4 (2024): hired "Kyle", a DPRK operative who passed background checks and ID verification.',
    'Zhenxing & Kejia Wang (2025-2026): placed DPRK workers in >100 US companies with stolen identities; >$5M revenue; laptop farms + shell companies.',
    'DOJ (Dec 2024): 14 DPRK nationals indicted for >=$88M generated over six years.',
  ],
}
