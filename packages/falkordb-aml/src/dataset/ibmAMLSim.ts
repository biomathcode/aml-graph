import type { AMLDataset } from '../types.js'

/**
 * Benchmark AML Dataset modeled after IBM AMLSim and AML Graph Typologies.
 * Contains both normal background banking traffic and injected ground-truth typologies:
 * 1. Directed Cycles (Circular Flow / Round-tripping)
 * 2. Smurfing Fan-In (Aggregation under reporting threshold $10k)
 * 3. Smurfing Fan-Out (Dispersion under reporting threshold $10k)
 * 4. Scatter-Gather (Multi-mule layering)
 * 5. Sanctions / PEP exposure chain
 * 6. Entity Resolution (Shared phone, tax ID, device, and address)
 */
export function createBenchmarkAMLDataset(): AMLDataset {
  const baseTime = 1718000000000 // Fixed deterministic epoch timestamp for tests
  const hour = 3600 * 1000

  return {
    name: 'IBM-AMLSim-Benchmark-Graph',
    description:
      'Synthetic benchmark financial transaction graph adhering to IBM AMLSim and FALKOR AML typologies',
    accounts: [
      // --- Normal Commercial & Retail Accounts ---
      {
        id: 'ACC_RETAIL_1',
        accountNumber: 'US-RET-1001',
        bank: 'Chase',
        country: 'USA',
        type: 'checking',
        balance: 14500,
        initialRiskScore: 0.05,
      },
      {
        id: 'ACC_RETAIL_2',
        accountNumber: 'US-RET-1002',
        bank: 'BankOfAmerica',
        country: 'USA',
        type: 'checking',
        balance: 8900,
        initialRiskScore: 0.05,
      },
      {
        id: 'ACC_CORP_SUPPLIER',
        accountNumber: 'US-CORP-2001',
        bank: 'WellsFargo',
        country: 'USA',
        type: 'business',
        balance: 450000,
        initialRiskScore: 0.1,
      },
      {
        id: 'ACC_CORP_PAYROLL',
        accountNumber: 'US-CORP-2002',
        bank: 'CitiBank',
        country: 'USA',
        type: 'business',
        balance: 920000,
        initialRiskScore: 0.1,
      },

      // --- Typology 1: Cycle / Round-tripping Accounts ---
      {
        id: 'ACC_CYCLE_A',
        accountNumber: 'CYC-001',
        bank: 'AlphaBank',
        country: 'CYM',
        type: 'shell_corporate',
        balance: 120000,
        initialRiskScore: 0.7,
      },
      {
        id: 'ACC_CYCLE_B',
        accountNumber: 'CYC-002',
        bank: 'BetaFinancial',
        country: 'PAN',
        type: 'shell_corporate',
        balance: 115000,
        initialRiskScore: 0.75,
      },
      {
        id: 'ACC_CYCLE_C',
        accountNumber: 'CYC-003',
        bank: 'GammaTrust',
        country: 'BVI',
        type: 'shell_corporate',
        balance: 110000,
        initialRiskScore: 0.8,
      },

      // --- Typology 2: Smurfing Fan-In (Aggregation) ---
      {
        id: 'ACC_SMURF_IN_1',
        accountNumber: 'SMURF-IN-01',
        bank: 'CommunityBank',
        country: 'USA',
        type: 'checking',
        balance: 2000,
        initialRiskScore: 0.6,
      },
      {
        id: 'ACC_SMURF_IN_2',
        accountNumber: 'SMURF-IN-02',
        bank: 'MetroCreditUnion',
        country: 'USA',
        type: 'checking',
        balance: 1500,
        initialRiskScore: 0.6,
      },
      {
        id: 'ACC_SMURF_IN_3',
        accountNumber: 'SMURF-IN-03',
        bank: 'RegionalTrust',
        country: 'USA',
        type: 'checking',
        balance: 3100,
        initialRiskScore: 0.6,
      },
      {
        id: 'ACC_SMURF_IN_4',
        accountNumber: 'SMURF-IN-04',
        bank: 'StateSavings',
        country: 'USA',
        type: 'checking',
        balance: 2400,
        initialRiskScore: 0.6,
      },
      {
        id: 'ACC_AGGREGATOR_MAIN',
        accountNumber: 'AGGR-MAIN-99',
        bank: 'GlobalCommercial',
        country: 'USA',
        type: 'business',
        balance: 95000,
        initialRiskScore: 0.85,
      },

      // --- Typology 3: Smurfing Fan-Out (Dispersion) ---
      {
        id: 'ACC_DISPERSER_MAIN',
        accountNumber: 'DISP-MAIN-88',
        bank: 'AtlanticBank',
        country: 'USA',
        type: 'business',
        balance: 85000,
        initialRiskScore: 0.85,
      },
      {
        id: 'ACC_SMURF_OUT_1',
        accountNumber: 'SMURF-OUT-01',
        bank: 'PacificBank',
        country: 'USA',
        type: 'checking',
        balance: 9500,
        initialRiskScore: 0.5,
      },
      {
        id: 'ACC_SMURF_OUT_2',
        accountNumber: 'SMURF-OUT-02',
        bank: 'PacificBank',
        country: 'USA',
        type: 'checking',
        balance: 9200,
        initialRiskScore: 0.5,
      },
      {
        id: 'ACC_SMURF_OUT_3',
        accountNumber: 'SMURF-OUT-03',
        bank: 'PacificBank',
        country: 'USA',
        type: 'checking',
        balance: 9800,
        initialRiskScore: 0.5,
      },
      {
        id: 'ACC_SMURF_OUT_4',
        accountNumber: 'SMURF-OUT-04',
        bank: 'PacificBank',
        country: 'USA',
        type: 'checking',
        balance: 9400,
        initialRiskScore: 0.5,
      },

      // --- Typology 4: Scatter-Gather (Layering / Mule Funnel) ---
      {
        id: 'ACC_SCATTER_SRC',
        accountNumber: 'SCAT-SRC-01',
        bank: 'OffshoreHoldings',
        country: 'BLZ',
        type: 'shell_corporate',
        balance: 250000,
        initialRiskScore: 0.8,
      },
      {
        id: 'ACC_MULE_1',
        accountNumber: 'MULE-001',
        bank: 'LocalTrust',
        country: 'USA',
        type: 'mule',
        balance: 300,
        initialRiskScore: 0.65,
      },
      {
        id: 'ACC_MULE_2',
        accountNumber: 'MULE-002',
        bank: 'ExpressBanking',
        country: 'USA',
        type: 'mule',
        balance: 450,
        initialRiskScore: 0.65,
      },
      {
        id: 'ACC_MULE_3',
        accountNumber: 'MULE-003',
        bank: 'FirstSavings',
        country: 'USA',
        type: 'mule',
        balance: 200,
        initialRiskScore: 0.65,
      },
      {
        id: 'ACC_GATHER_DEST',
        accountNumber: 'GATH-DEST-99',
        bank: 'SwissPrivateBank',
        country: 'CHE',
        type: 'business',
        balance: 400000,
        initialRiskScore: 0.75,
      },

      // --- Typology 5: Sanctions & PEP Exposure ---
      {
        id: 'ACC_SANCTIONED_ENTITY',
        accountNumber: 'OFAC-SDN-999',
        bank: 'SanctionedBankState',
        country: 'RUS',
        type: 'business',
        balance: 5000000,
        isSanctioned: true,
        initialRiskScore: 1.0,
      },
      {
        id: 'ACC_CONDUIT_PROXY',
        accountNumber: 'PROXY-777',
        bank: 'CyprusIntermediary',
        country: 'CYP',
        type: 'shell_corporate',
        balance: 450000,
        initialRiskScore: 0.85,
      },
      {
        id: 'ACC_TARGET_RECIPIENT',
        accountNumber: 'TARGET-888',
        bank: 'DeutscheCommercial',
        country: 'DEU',
        type: 'business',
        balance: 850000,
        initialRiskScore: 0.4,
      },

      // --- Typology 6: DPRK IT-Worker Funding (remote worker scheme) ---
      // Laptop-farm relay (US facilitator) + OFAC-designated DPRK fronts
      {
        id: 'ACC_EMPLOYER_DGS',
        accountNumber: 'EMPL-DGS-07',
        bank: 'Digital Merchant Bank',
        country: 'USA',
        type: 'business',
        balance: 420000,
        initialRiskScore: 0.1,
      },
      {
        id: 'ACC_LAPTOP_FARM_US',
        accountNumber: 'LAPTOPFARM-44',
        bank: 'First Charset National Bank',
        country: 'USA',
        type: 'mule',
        balance: 78000,
        initialRiskScore: 0.75,
      },
      {
        id: 'ACC_NK_FRONT_CHN',
        accountNumber: 'CHONSURIM-01',
        bank: 'Chonsurim Trading Corporation',
        country: 'CHN',
        type: 'shell_corporate',
        balance: 320000,
        isSanctioned: true,
        initialRiskScore: 1.0,
      },
      {
        id: 'ACC_NK_FRONT_LAO',
        accountNumber: 'OSONG-02',
        bank: 'Korea Osong Shipping Co',
        country: 'LAO',
        type: 'shell_corporate',
        balance: 210000,
        isSanctioned: true,
        initialRiskScore: 1.0,
      },
      {
        // Ordinary customer for contrast; worker identity hit score should NOT trigger
        id: 'ACC_RETAIL_3',
        accountNumber: 'RETAIL-90311',
        bank: 'Capital One',
        country: 'CAN',
        type: 'checking',
        balance: 56000,
      },
    ],

    persons: [
      // Legitimate Person
      {
        id: 'PER_ALICE',
        name: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        phone: '+1-555-0101',
        address: '100 Market St, San Francisco, CA',
        taxId: 'SSN-987-11-2222',
        nationality: 'USA',
      },
      // Legitimate Person
      {
        id: 'PER_BOB',
        name: 'Bob Martinez',
        email: 'bob.martinez@example.com',
        phone: '+1-555-0102',
        address: '200 Broadway, New York, NY',
        taxId: 'SSN-987-22-3333',
        nationality: 'USA',
      },

      // Entity Resolution Cluster 1: Synthetic Identity / Multi-Account Fraud
      // Victor Vance & V. Vance sharing Tax ID and Phone Number
      {
        id: 'PER_VICTOR_1',
        name: 'Victor Vance',
        email: 'victor.vance@shadowmail.com',
        phone: '+1-555-9988',
        address: '742 Evergreen Terrace, Springfield, OR',
        taxId: 'SSN-000-88-7777',
        deviceId: 'DEV-FINGERPRINT-X99',
        nationality: 'USA',
      },
      {
        id: 'PER_VICTOR_2',
        name: 'V. Vance Holdings LLC',
        email: 'billing@vvance-enterprises.net',
        phone: '+1-555-9988', // EXACT SHARED PHONE
        address: '742 Evergreen Terrace, Suite B, Springfield, OR',
        taxId: 'SSN-000-88-7777', // EXACT SHARED TAX ID
        deviceId: 'DEV-FINGERPRINT-X99', // EXACT SHARED DEVICE
        nationality: 'USA',
      },

      // Entity Resolution Cluster 2: Mule Recruiters sharing Device Fingerprint & IP
      {
        id: 'PER_MULE_OPERATOR_A',
        name: 'Carlos Mendez',
        email: 'carlos.m@proton.me',
        phone: '+1-555-4433',
        address: '12 Ocean Drive, Miami, FL',
        deviceId: 'DEV-RING-DEVICE-M7',
        ipAddress: '198.51.100.45',
        nationality: 'USA',
      },
      {
        id: 'PER_MULE_OPERATOR_B',
        name: 'Charles Mendez',
        email: 'cmendez.invest@proton.me',
        phone: '+1-555-4434',
        address: '12 Ocean Drive, Apt 4, Miami, FL',
        deviceId: 'DEV-RING-DEVICE-M7', // EXACT SHARED DEVICE
        ipAddress: '198.51.100.45', // EXACT SHARED IP
        nationality: 'USA',
      },

      // DPRK IT-Worker Cell: fake "USA freelancers" operating on shared
      // laptop-farm identity + DPRK-allocated IP space (proxy scheme)
      {
        id: 'PER_NK_WORKER_1',
        name: 'Grace Miller',
        email: 'grace.miller.freel@shadowmail.com',
        phone: '+1-555-7711',
        address: '2200 N Central Ave, Litchfield Park, AZ',
        taxId: 'SSN-999-31-4401', // STOLEN from PER_IDENTITY_VICTIM (third-party identity reuse)
        deviceId: 'DEV-LAPTOP-FARM-22', // shared laptop farm device
        ipAddress: '175.45.176.72', // DPRK-nationally allocated range
        nationality: 'USA', // falsified nationality claim
      },
      {
        id: 'PER_NK_WORKER_2',
        name: 'Daniel Cooper',
        email: 'daniel.cooper.dev@freelancehub.net',
        phone: '+1-555-7712',
        address: '2200 N Central Ave, Litchfield Park, AZ',
        taxId: 'SSN-987-44-5566',
        deviceId: 'DEV-LAPTOP-FARM-22', // SAME farm device
        ipAddress: '175.45.176.72', // SAME DPRK IP
        nationality: 'USA', // falsified nationality claim
      },
      // Control subject: legitimate customer, no DPRK indicators
      {
        id: 'PER_NORA',
        name: 'Nora Larsen',
        email: 'nora.larsen@example.com',
        phone: '+1-555-0510',
        address: '88 Birchwood Rd, Toronto, ON',
        taxId: 'TIN-CAN-771-002',
        nationality: 'CAN',
      },
      // Identity-theft victim whose US tax ID was taken by the DPRK operative
      // "Grace Miller". No accounts/transactions: purely a third-party identity.
      {
        id: 'PER_IDENTITY_VICTIM',
        name: 'Michael Torres',
        email: 'michael.torres@example.com',
        phone: '+1-555-2231',
        address: '415 Mesa Vista Ct, Tempe, AZ',
        taxId: 'SSN-999-31-4401',
        nationality: 'USA',
      },
    ],

    ownership: [
      { personId: 'PER_ALICE', accountId: 'ACC_RETAIL_1', role: 'owner' },
      { personId: 'PER_BOB', accountId: 'ACC_RETAIL_2', role: 'owner' },
      { personId: 'PER_VICTOR_1', accountId: 'ACC_CYCLE_A', role: 'owner' },
      { personId: 'PER_VICTOR_2', accountId: 'ACC_CYCLE_B', role: 'signatory' },
      {
        personId: 'PER_MULE_OPERATOR_A',
        accountId: 'ACC_MULE_1',
        role: 'owner',
      },
      {
        personId: 'PER_MULE_OPERATOR_B',
        accountId: 'ACC_MULE_2',
        role: 'owner',
      },
      {
        personId: 'PER_NK_WORKER_1',
        accountId: 'ACC_LAPTOP_FARM_US',
        role: 'beneficiary',
      },
      {
        personId: 'PER_NK_WORKER_2',
        accountId: 'ACC_LAPTOP_FARM_US',
        role: 'signatory',
      },
      {
        personId: 'PER_NK_WORKER_1',
        accountId: 'ACC_NK_FRONT_CHN',
        role: 'beneficiary',
      },
      {
        personId: 'PER_NK_WORKER_2',
        accountId: 'ACC_NK_FRONT_LAO',
        role: 'beneficiary',
      },
      { personId: 'PER_NORA', accountId: 'ACC_RETAIL_3', role: 'owner' },
    ],

    transactions: [
      // Normal transactions
      {
        id: 'TX_NORM_1',
        sourceAccountId: 'ACC_CORP_PAYROLL',
        targetAccountId: 'ACC_RETAIL_1',
        amount: 4500,
        currency: 'USD',
        timestamp: baseTime + 1 * hour,
        type: 'ach',
        groundTruthTypology: 'normal',
      },
      {
        id: 'TX_NORM_2',
        sourceAccountId: 'ACC_CORP_PAYROLL',
        targetAccountId: 'ACC_RETAIL_2',
        amount: 3800,
        currency: 'USD',
        timestamp: baseTime + 2 * hour,
        type: 'ach',
        groundTruthTypology: 'normal',
      },
      {
        id: 'TX_NORM_3',
        sourceAccountId: 'ACC_RETAIL_1',
        targetAccountId: 'ACC_CORP_SUPPLIER',
        amount: 850,
        currency: 'USD',
        timestamp: baseTime + 4 * hour,
        type: 'wire',
        groundTruthTypology: 'normal',
      },

      // --- Typology 1: Cycle / Round-tripping ---
      // ACC_CYCLE_A -> ACC_CYCLE_B -> ACC_CYCLE_C -> ACC_CYCLE_A
      {
        id: 'TX_CYC_1',
        sourceAccountId: 'ACC_CYCLE_A',
        targetAccountId: 'ACC_CYCLE_B',
        amount: 50000,
        currency: 'USD',
        timestamp: baseTime + 10 * hour,
        type: 'wire',
        groundTruthTypology: 'cycle',
        notes: 'Cycle Hop 1: Origin to offshore layer',
      },
      {
        id: 'TX_CYC_2',
        sourceAccountId: 'ACC_CYCLE_B',
        targetAccountId: 'ACC_CYCLE_C',
        amount: 48500,
        currency: 'USD',
        timestamp: baseTime + 14 * hour,
        type: 'wire',
        groundTruthTypology: 'cycle',
        notes: 'Cycle Hop 2: Layering to BVI trust',
      },
      {
        id: 'TX_CYC_3',
        sourceAccountId: 'ACC_CYCLE_C',
        targetAccountId: 'ACC_CYCLE_A',
        amount: 47000,
        currency: 'USD',
        timestamp: baseTime + 18 * hour,
        type: 'wire',
        groundTruthTypology: 'cycle',
        notes: 'Cycle Hop 3: Returned to origin (94% retained)',
      },

      // --- Typology 2: Smurfing Fan-In (Structuring below $10,000 threshold) ---
      {
        id: 'TX_SMURF_IN_1',
        sourceAccountId: 'ACC_SMURF_IN_1',
        targetAccountId: 'ACC_AGGREGATOR_MAIN',
        amount: 9500,
        currency: 'USD',
        timestamp: baseTime + 20 * hour,
        type: 'cash_deposit',
        groundTruthTypology: 'smurfing_fan_in',
        notes: 'Structuring deposit 1',
      },
      {
        id: 'TX_SMURF_IN_2',
        sourceAccountId: 'ACC_SMURF_IN_2',
        targetAccountId: 'ACC_AGGREGATOR_MAIN',
        amount: 9200,
        currency: 'USD',
        timestamp: baseTime + 21 * hour,
        type: 'cash_deposit',
        groundTruthTypology: 'smurfing_fan_in',
        notes: 'Structuring deposit 2',
      },
      {
        id: 'TX_SMURF_IN_3',
        sourceAccountId: 'ACC_SMURF_IN_3',
        targetAccountId: 'ACC_AGGREGATOR_MAIN',
        amount: 9800,
        currency: 'USD',
        timestamp: baseTime + 22 * hour,
        type: 'cash_deposit',
        groundTruthTypology: 'smurfing_fan_in',
        notes: 'Structuring deposit 3',
      },
      {
        id: 'TX_SMURF_IN_4',
        sourceAccountId: 'ACC_SMURF_IN_4',
        targetAccountId: 'ACC_AGGREGATOR_MAIN',
        amount: 9400,
        currency: 'USD',
        timestamp: baseTime + 23 * hour,
        type: 'cash_deposit',
        groundTruthTypology: 'smurfing_fan_in',
        notes: 'Structuring deposit 4',
      },

      // --- Typology 3: Smurfing Fan-Out (Dispersion below $10,000 threshold) ---
      {
        id: 'TX_SMURF_OUT_1',
        sourceAccountId: 'ACC_DISPERSER_MAIN',
        targetAccountId: 'ACC_SMURF_OUT_1',
        amount: 9600,
        currency: 'USD',
        timestamp: baseTime + 25 * hour,
        type: 'internal_transfer',
        groundTruthTypology: 'smurfing_fan_out',
      },
      {
        id: 'TX_SMURF_OUT_2',
        sourceAccountId: 'ACC_DISPERSER_MAIN',
        targetAccountId: 'ACC_SMURF_OUT_2',
        amount: 9300,
        currency: 'USD',
        timestamp: baseTime + 26 * hour,
        type: 'internal_transfer',
        groundTruthTypology: 'smurfing_fan_out',
      },
      {
        id: 'TX_SMURF_OUT_3',
        sourceAccountId: 'ACC_DISPERSER_MAIN',
        targetAccountId: 'ACC_SMURF_OUT_3',
        amount: 9700,
        currency: 'USD',
        timestamp: baseTime + 27 * hour,
        type: 'internal_transfer',
        groundTruthTypology: 'smurfing_fan_out',
      },
      {
        id: 'TX_SMURF_OUT_4',
        sourceAccountId: 'ACC_DISPERSER_MAIN',
        targetAccountId: 'ACC_SMURF_OUT_4',
        amount: 9500,
        currency: 'USD',
        timestamp: baseTime + 28 * hour,
        type: 'internal_transfer',
        groundTruthTypology: 'smurfing_fan_out',
      },

      // --- Typology 4: Scatter-Gather (Mule Layering) ---
      // Origin scatters to 3 mules, who then gather funds at destination
      {
        id: 'TX_SCAT_1',
        sourceAccountId: 'ACC_SCATTER_SRC',
        targetAccountId: 'ACC_MULE_1',
        amount: 30000,
        currency: 'USD',
        timestamp: baseTime + 30 * hour,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },
      {
        id: 'TX_SCAT_2',
        sourceAccountId: 'ACC_SCATTER_SRC',
        targetAccountId: 'ACC_MULE_2',
        amount: 30000,
        currency: 'USD',
        timestamp: baseTime + 31 * hour,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },
      {
        id: 'TX_SCAT_3',
        sourceAccountId: 'ACC_SCATTER_SRC',
        targetAccountId: 'ACC_MULE_3',
        amount: 30000,
        currency: 'USD',
        timestamp: baseTime + 31 * hour + 1800000,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },
      {
        id: 'TX_GATH_1',
        sourceAccountId: 'ACC_MULE_1',
        targetAccountId: 'ACC_GATHER_DEST',
        amount: 29200,
        currency: 'USD',
        timestamp: baseTime + 34 * hour,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },
      {
        id: 'TX_GATH_2',
        sourceAccountId: 'ACC_MULE_2',
        targetAccountId: 'ACC_GATHER_DEST',
        amount: 29100,
        currency: 'USD',
        timestamp: baseTime + 35 * hour,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },
      {
        id: 'TX_GATH_3',
        sourceAccountId: 'ACC_MULE_3',
        targetAccountId: 'ACC_GATHER_DEST',
        amount: 29300,
        currency: 'USD',
        timestamp: baseTime + 36 * hour,
        type: 'wire',
        groundTruthTypology: 'scatter_gather',
      },

      // --- Typology 5: Sanctions Exposure Chain ---
      // OFAC Sanctioned Entity -> Conduit Proxy -> Target Recipient
      {
        id: 'TX_SANC_1',
        sourceAccountId: 'ACC_SANCTIONED_ENTITY',
        targetAccountId: 'ACC_CONDUIT_PROXY',
        amount: 250000,
        currency: 'USD',
        timestamp: baseTime + 40 * hour,
        type: 'wire',
        groundTruthTypology: 'sanctions_flow',
        notes: 'Direct transfer from OFAC-sanctioned bank account',
      },
      {
        id: 'TX_SANC_2',
        sourceAccountId: 'ACC_CONDUIT_PROXY',
        targetAccountId: 'ACC_TARGET_RECIPIENT',
        amount: 240000,
        currency: 'USD',
        timestamp: baseTime + 44 * hour,
        type: 'wire',
        groundTruthTypology: 'sanctions_flow',
        notes: 'Conduit transfer to target commercial beneficiary',
      },

      // --- Typology 6: DPRK IT-Worker Funding ---
      // Multiple "employers" pay the laptop-farm relay, which then remits
      // via USDT/crypto to OFAC-designated DPRK front companies
      {
        id: 'TX_NK_1',
        sourceAccountId: 'ACC_CORP_PAYROLL',
        targetAccountId: 'ACC_LAPTOP_FARM_US',
        amount: 48000,
        currency: 'USD',
        timestamp: baseTime + 50 * hour,
        type: 'wire',
        groundTruthTypology: 'nk_it_worker_funding',
        notes:
          'Contractor payout for "Daniel Cooper" (full-stack engineer, claimed USA) routed to facilitator relay',
      },
      {
        id: 'TX_NK_2',
        sourceAccountId: 'ACC_EMPLOYER_DGS',
        targetAccountId: 'ACC_LAPTOP_FARM_US',
        amount: 39500,
        currency: 'USD',
        timestamp: baseTime + 52 * hour,
        type: 'wire',
        groundTruthTypology: 'nk_it_worker_funding',
        notes: 'Freelance platform settlement for "Grace Miller" (claimed USA)',
      },
      {
        id: 'TX_NK_3',
        sourceAccountId: 'ACC_LAPTOP_FARM_US',
        targetAccountId: 'ACC_NK_FRONT_CHN',
        amount: 68000,
        currency: 'USDT',
        timestamp: baseTime + 54 * hour,
        type: 'crypto_swap',
        groundTruthTypology: 'nk_it_worker_funding',
        notes: 'USDT remittance via OTC desk to sanctioned DPRK front',
      },
      {
        id: 'TX_NK_4',
        sourceAccountId: 'ACC_LAPTOP_FARM_US',
        targetAccountId: 'ACC_NK_FRONT_LAO',
        amount: 27500,
        currency: 'USDT',
        timestamp: baseTime + 56 * hour,
        type: 'crypto_swap',
        groundTruthTypology: 'nk_it_worker_funding',
        notes: 'Second-step remittance to DPRK revenue front (Laos conduit)',
      },
    ],

    groundTruthTypologies: [
      {
        typology: 'cycle',
        description: 'Circular payment loop across 3 offshore shell companies',
        involvedAccounts: ['ACC_CYCLE_A', 'ACC_CYCLE_B', 'ACC_CYCLE_C'],
        involvedTransactions: ['TX_CYC_1', 'TX_CYC_2', 'TX_CYC_3'],
      },
      {
        typology: 'smurfing_fan_in',
        description:
          '4 sub-$10k deposits aggregating $37,900 into single business account',
        involvedAccounts: [
          'ACC_SMURF_IN_1',
          'ACC_SMURF_IN_2',
          'ACC_SMURF_IN_3',
          'ACC_SMURF_IN_4',
          'ACC_AGGREGATOR_MAIN',
        ],
        involvedTransactions: [
          'TX_SMURF_IN_1',
          'TX_SMURF_IN_2',
          'TX_SMURF_IN_3',
          'TX_SMURF_IN_4',
        ],
      },
      {
        typology: 'smurfing_fan_out',
        description:
          'Rapid dispersal of $38,100 to 4 sub-accounts under reporting limits',
        involvedAccounts: [
          'ACC_DISPERSER_MAIN',
          'ACC_SMURF_OUT_1',
          'ACC_SMURF_OUT_2',
          'ACC_SMURF_OUT_3',
          'ACC_SMURF_OUT_4',
        ],
        involvedTransactions: [
          'TX_SMURF_OUT_1',
          'TX_SMURF_OUT_2',
          'TX_SMURF_OUT_3',
          'TX_SMURF_OUT_4',
        ],
      },
      {
        typology: 'scatter_gather',
        description:
          'Scatter from offshore holding to 3 money mules and gathered at Swiss destination',
        involvedAccounts: [
          'ACC_SCATTER_SRC',
          'ACC_MULE_1',
          'ACC_MULE_2',
          'ACC_MULE_3',
          'ACC_GATHER_DEST',
        ],
        involvedTransactions: [
          'TX_SCAT_1',
          'TX_SCAT_2',
          'TX_SCAT_3',
          'TX_GATH_1',
          'TX_GATH_2',
          'TX_GATH_3',
        ],
      },
      {
        typology: 'sanctions_flow',
        description:
          '2-hop fund routing from OFAC-sanctioned entity through intermediary conduit',
        involvedAccounts: [
          'ACC_SANCTIONED_ENTITY',
          'ACC_CONDUIT_PROXY',
          'ACC_TARGET_RECIPIENT',
        ],
        involvedTransactions: ['TX_SANC_1', 'TX_SANC_2'],
      },
      {
        typology: 'nk_it_worker_funding',
        description:
          'DPRK remote IT-worker cell: salaries from multiple employers aggregated in a laptop-farm relay account, then remitted in USDT to OFAC-designated DPRK front companies under falsified third-party identities',
        involvedAccounts: [
          'ACC_LAPTOP_FARM_US',
          'ACC_NK_FRONT_CHN',
          'ACC_NK_FRONT_LAO',
        ],
        involvedTransactions: ['TX_NK_1', 'TX_NK_2', 'TX_NK_3', 'TX_NK_4'],
      },
    ],
  }
}
