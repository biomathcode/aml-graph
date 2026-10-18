import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { config } from './config.js'

export interface BaseEmailParams {
  to: string
  recipientName?: string
  recipientType?: 'employee' | 'customer' | 'individual'
  sessionId?: string
  publicToken?: string
}

export interface KycInvitationParams extends BaseEmailParams {
  workflowName?: string
  role?: string
  department?: string
  expiresInHours?: number
  customMessage?: string
}

export interface DocumentsSubmittedParams extends BaseEmailParams {
  documentCount?: number
  timestamp?: number | string
}

export interface DocumentVerifiedParams extends BaseEmailParams {
  documentType?: string
  extractedFields?: Record<string, any>
  ocrEngine?: string
  timestamp?: number | string
}

export interface AmlChecksCompletedParams extends BaseEmailParams {
  riskLevel?: 'clean' | 'low' | 'medium' | 'high' | 'critical' | string
  riskScore?: number
  sanctionsStatus?: 'clean' | 'flagged' | string
  pepStatus?: 'clear' | 'flagged' | string
  matchedEntities?: string[]
  adverseMediaCount?: number
  timestamp?: number | string
}

export interface VerificationDecisionParams extends BaseEmailParams {
  decision: 'approved' | 'rejected'
  notes?: string
  reviewerName?: string
  timestamp?: number | string
}

// Resend Client Initialization
const resendApiKey =
  process.env.RESEND_API_KEY ||
  process.env.RESENT_API_KEY ||
  config.RESEND_API_KEY ||
  ''

let resendClient: Resend | null = null
if (resendApiKey) {
  resendClient = new Resend(resendApiKey)
}

export function getMailerConfig() {
  let defaultFrom =
    process.env.RESEND_FROM ||
    config.RESEND_FROM

  if (
    !defaultFrom ||
    defaultFrom.includes('example.com') ||
    defaultFrom.includes('localhost')
  ) {
    defaultFrom = 'OpenKYC <onboarding@resend.dev>'
  }

  return {
    isConfigured: Boolean(resendApiKey || process.env.SMTP_URL),
    provider: resendApiKey ? 'resend' : process.env.SMTP_URL ? 'smtp' : 'mock',
    from: defaultFrom,
    appUrl: config.APP_URL,
  }
}

/**
 * Core low-level send email function.
 * Uses Resend API when RESEND_API_KEY (or RESENT_API_KEY) is available.
 * Falls back to SMTP or logs to console in development.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html?: string
  text: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const mailConfig = getMailerConfig()
  const from = mailConfig.from

  // 1. Resend API via SDK
  if (resendClient && resendApiKey) {
    try {
      const result = await resendClient.emails.send({
        from,
        to: [to],
        subject,
        html: html || `<p style="font-family:sans-serif;white-space:pre-wrap;">${text}</p>`,
        text,
      })

      if (result.error) {
        console.error('[OpenKYC Mailer] Resend API error:', result.error)
        return { success: false, error: result.error.message }
      }

      console.log(`[OpenKYC Mailer] Sent via Resend to ${to}: ${subject} (ID: ${result.data?.id})`)
      return { success: true, id: result.data?.id }
    } catch (err: any) {
      console.error('[OpenKYC Mailer] Exception sending via Resend:', err)
      return { success: false, error: err.message || 'Resend delivery exception' }
    }
  }

  // 2. SMTP fallback if configured
  if (process.env.SMTP_URL) {
    try {
      const transporter = nodemailer.createTransport(process.env.SMTP_URL)
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      })
      console.log(`[OpenKYC Mailer] Sent via SMTP to ${to}: ${subject}`)
      return { success: true, id: info.messageId }
    } catch (err: any) {
      console.error('[OpenKYC Mailer] SMTP delivery failed:', err)
      return { success: false, error: err.message }
    }
  }

  // 3. Mock fallback for local dev when no keys set
  console.log(`[OpenKYC Mailer: DEV MOCK] To: ${to} | Subject: "${subject}"\n${text}`)
  return { success: true, id: `mock-${Date.now()}` }
}

/* ========================================================================= */
/*                         EMAIL HTML TEMPLATE WRAPPER                       */
/* ========================================================================= */

function renderEmailLayout({
  badgeText,
  badgeColor,
  title,
  subtitle,
  bodyContent,
  ctaText,
  ctaUrl,
  footnote,
}: {
  badgeText: string
  badgeColor: { bg: string; text: string; border: string }
  title: string
  subtitle?: string
  bodyContent: string
  ctaText?: string
  ctaUrl?: string
  footnote?: string
}) {
  const currentYear = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
          
          <!-- Top Accent Gradient Line -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, #3b82f6 0%, #10b981 50%, #8b5cf6 100%);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding:32px 36px 20px 36px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:10px;">
                      <!-- Logo Icon -->
                      <div style="background-color:#27272a;padding:8px 12px;border-radius:10px;border:1px solid #3f3f46;display:inline-block;">
                        <span style="font-size:16px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">OPEN<span style="color:#10b981;">KYC</span></span>
                      </div>
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;border-radius:9999px;background-color:${badgeColor.bg};color:${badgeColor.text};border:1px solid ${badgeColor.border};">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:24px 0 6px 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
                ${title}
              </h1>
              ${
                subtitle
                  ? `<p style="margin:0 0 16px 0;font-size:14px;color:#a1a1aa;line-height:1.5;">${subtitle}</p>`
                  : ''
              }
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:0 36px 24px 36px;font-size:14px;line-height:1.6;color:#d4d4d8;">
              ${bodyContent}
            </td>
          </tr>

          <!-- CTA Button -->
          ${
            ctaText && ctaUrl
              ? `<tr>
            <td style="padding:8px 36px 36px 36px;" align="center">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#10b981;">
                    <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;background-color:#10b981;letter-spacing:0.2px;">
                      ${ctaText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0 0;font-size:12px;color:#71717a;">
                Or visit: <a href="${ctaUrl}" style="color:#38bdf8;text-decoration:underline;word-break:break-all;">${ctaUrl}</a>
              </p>
            </td>
          </tr>`
              : ''
          }

          <!-- Divider -->
          <tr>
            <td style="border-top:1px solid #27272a;"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#121215;font-size:12px;color:#71717a;line-height:1.5;">
              ${
                footnote
                  ? `<p style="margin:0 0 10px 0;color:#a1a1aa;">${footnote}</p>`
                  : ''
              }
              <p style="margin:0;">
                Secure Identity & Compliance Verification platform powered by OpenKYC.<br>
                &copy; ${currentYear} OpenKYC Inc. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/* ========================================================================= */
/*                   TRANSACTIONAL KYC NOTIFICATION METHODS                  */
/* ========================================================================= */

/**
 * 1. KYC Invitation Email: Sent to an employee or customer to initiate KYC verification.
 */
export async function sendKycInvitationEmail(params: KycInvitationParams) {
  const {
    to,
    recipientName = 'Valued Partner',
    recipientType = 'customer',
    sessionId,
    publicToken,
    workflowName = 'Standard Identity Verification',
    role,
    department,
    expiresInHours = 72,
    customMessage,
  } = params

  const sessionUrl = sessionId
    ? `${config.APP_URL}/sessions/${sessionId}${publicToken ? `?token=${publicToken}` : ''}`
    : config.APP_URL

  const isEmployee = recipientType === 'employee'
  const subject = isEmployee
    ? `Action Required: Employee KYC Verification Request — OpenKYC`
    : `Complete Your Identity Verification (KYC) — OpenKYC`

  const bodyContent = `
    <p style="margin:0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      ${
        customMessage ||
        (isEmployee
          ? `You have been requested to complete an employee compliance verification for your internal profile at <strong>OpenKYC</strong>${department ? ` (${department})` : ''}.`
          : `You have been requested to complete an identity verification session with <strong>OpenKYC</strong>.`)
      }
    </p>

    <!-- Details Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#27272a;border-radius:10px;border:1px solid #3f3f46;margin:16px 0 24px 0;padding:16px;">
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Verification Type:</td>
        <td style="font-size:13px;font-weight:600;color:#ffffff;text-align:right;padding:4px 0;">${isEmployee ? 'Employee Onboarding / Compliance' : 'Customer Identity Verification'}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Workflow:</td>
        <td style="font-size:13px;color:#ffffff;text-align:right;padding:4px 0;">${workflowName}</td>
      </tr>
      ${
        role
          ? `<tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Role / Title:</td>
        <td style="font-size:13px;color:#ffffff;text-align:right;padding:4px 0;">${role}</td>
      </tr>`
          : ''
      }
      ${
        sessionId
          ? `<tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Session ID:</td>
        <td style="font-size:12px;font-family:monospace;color:#38bdf8;text-align:right;padding:4px 0;">${sessionId}</td>
      </tr>`
          : ''
      }
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Access Validity:</td>
        <td style="font-size:13px;color:#facc15;text-align:right;padding:4px 0;">Expires in ${expiresInHours} hours</td>
      </tr>
    </table>

    <h3 style="font-size:14px;color:#ffffff;margin:20px 0 10px 0;">What you'll need:</h3>
    <ul style="margin:0 0 16px 0;padding-left:20px;color:#d4d4d8;">
      <li style="margin-bottom:6px;">A valid government-issued ID (Passport, Driver License, or National ID)</li>
      <li style="margin-bottom:6px;">A well-lit environment for taking a clear photo of your document</li>
      <li style="margin-bottom:6px;">A device equipped with a front-facing camera for quick live facial match</li>
    </ul>

    <p style="margin:16px 0 0 0;font-size:13px;color:#a1a1aa;">
      Please click the button below to begin your secure, encrypted session. The process takes less than 3 minutes.
    </p>
  `

  const html = renderEmailLayout({
    badgeText: 'Action Required',
    badgeColor: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: '#3b82f6' },
    title: isEmployee ? 'Employee Compliance Verification' : 'Identity Verification Request',
    subtitle: `Session established for ${recipientName}. Please submit your required identification documents.`,
    bodyContent,
    ctaText: 'Start Verification Now',
    ctaUrl: sessionUrl,
    footnote:
      'This link is unique to you. Do not share or forward this email. For security reasons, the link will expire automatically.',
  })

  const text = `Hello ${recipientName},

You have been requested to complete an identity verification (KYC) session with OpenKYC.

Session ID: ${sessionId || 'N/A'}
Workflow: ${workflowName}
Expires: In ${expiresInHours} hours

To begin your verification, please open the following link:
${sessionUrl}

OpenKYC Compliance Team`

  return sendEmail({ to, subject, html, text })
}

/**
 * 2. Documents Submitted Email: Sent immediately when the user finishes uploading their documents.
 */
export async function sendDocumentsSubmittedEmail(params: DocumentsSubmittedParams) {
  const {
    to,
    recipientName = 'Customer',
    recipientType = 'customer',
    sessionId,
    publicToken,
    documentCount = 1,
    timestamp = Date.now(),
  } = params

  const sessionUrl = sessionId
    ? `${config.APP_URL}/sessions/${sessionId}${publicToken ? `?token=${publicToken}` : ''}`
    : config.APP_URL

  const dateStr = new Date(timestamp).toLocaleString()
  const subject = `Documents Received — OpenKYC Verification In Progress`

  const bodyContent = `
    <p style="margin:0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      We have successfully received your submitted verification documents (${documentCount} item${documentCount > 1 ? 's' : ''}).
    </p>

    <!-- Status Card -->
    <div style="background-color:#27272a;border-radius:10px;border-left:4px solid #f59e0b;padding:16px;margin:20px 0;">
      <div style="font-size:12px;font-weight:700;color:#fbbf24;text-transform:uppercase;margin-bottom:4px;">
        Processing Step 1 of 3: Documents Submitted
      </div>
      <div style="font-size:13px;color:#e4e4e7;">
        Your documents are now queued in our automated pipeline for optical recognition (OCR), tampering analysis, and background screening.
      </div>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1c1c20;border-radius:10px;border:1px solid #2e2e33;margin:16px 0;padding:14px;">
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Submission Time:</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:4px 0;">${dateStr}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Subject Category:</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:4px 0;">${recipientType === 'employee' ? 'Employee Compliance' : 'Customer Verification'}</td>
      </tr>
      ${
        sessionId
          ? `<tr>
        <td style="font-size:12px;color:#a1a1aa;padding:4px 0;">Session Reference:</td>
        <td style="font-size:12px;font-family:monospace;color:#38bdf8;text-align:right;padding:4px 0;">${sessionId}</td>
      </tr>`
          : ''
      }
    </table>

    <p style="margin:16px 0 0 0;font-size:13px;color:#a1a1aa;">
      No further action is required from you at this time. You will receive real-time updates as verification progresses.
    </p>
  `

  const html = renderEmailLayout({
    badgeText: 'Documents Received',
    badgeColor: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: '#f59e0b' },
    title: 'Documents Successfully Received',
    subtitle: 'Automated verification pipeline has commenced.',
    bodyContent,
    ctaText: 'View Verification Status',
    ctaUrl: sessionUrl,
  })

  const text = `Hello ${recipientName},

We have received your verification documents for session ${sessionId}.
Submission time: ${dateStr}

Our automated engine is currently performing OCR and compliance checks. You will receive an update as soon as the results are available.

View status: ${sessionUrl}`

  return sendEmail({ to, subject, html, text })
}

/**
 * 3. Document Verified / OCR Done Email: Sent when OCR and document layout checks succeed.
 */
export async function sendDocumentVerifiedEmail(params: DocumentVerifiedParams) {
  const {
    to,
    recipientName = 'Customer',
    recipientType = 'customer',
    sessionId,
    publicToken,
    documentType = 'Government ID',
    extractedFields = {},
    ocrEngine = 'Indra OCR Engine',
    timestamp = Date.now(),
  } = params

  const sessionUrl = sessionId
    ? `${config.APP_URL}/sessions/${sessionId}${publicToken ? `?token=${publicToken}` : ''}`
    : config.APP_URL

  const dateStr = new Date(timestamp).toLocaleString()
  const subject = `Document Verified — Identity Extraction Complete (OpenKYC)`

  const fieldCount = Object.keys(extractedFields).length
  const sampleFields = [
    extractedFields.first_name ? `First Name: ${extractedFields.first_name}` : null,
    extractedFields.last_name ? `Last Name: ${extractedFields.last_name}` : null,
    extractedFields.nationality ? `Nationality: ${extractedFields.nationality}` : null,
    extractedFields.dob ? `Date of Birth: ${extractedFields.dob}` : null,
    extractedFields.document_number
      ? `Document No: •••• ${String(extractedFields.document_number).slice(-4)}`
      : null,
  ].filter(Boolean)

  const bodyContent = `
    <p style="margin:0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      Great news! Your uploaded <strong>${documentType}</strong> has been successfully read and verified by our automated OCR engine.
    </p>

    <!-- Success Stage Callout -->
    <div style="background-color:#27272a;border-radius:10px;border-left:4px solid #10b981;padding:16px;margin:20px 0;">
      <div style="font-size:12px;font-weight:700;color:#34d399;text-transform:uppercase;margin-bottom:4px;">
        Stage 2 of 3: Document Authenticated (${recipientType === 'employee' ? 'Employee' : 'Customer'})
      </div>
      <div style="font-size:13px;color:#e4e4e7;">
        ${ocrEngine} successfully extracted ${fieldCount} key data fields with valid checksums and biometric consistency at ${dateStr}.
      </div>
    </div>

    ${
      sampleFields.length > 0
        ? `<div style="background-color:#1c1c20;border-radius:10px;border:1px solid #2e2e33;margin:16px 0;padding:14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa;margin-bottom:8px;">Extracted & Validated Attributes:</div>
      ${sampleFields
        .map(
          (f) =>
            `<div style="font-size:12px;color:#d4d4d8;padding:2px 0;">&bull; ${f}</div>`,
        )
        .join('')}
    </div>`
        : ''
    }

    <p style="margin:16px 0 0 0;font-size:13px;color:#a1a1aa;">
      The verification has now advanced to automated Anti-Money Laundering (AML) sanctions, PEP screening, and graph risk analysis.
    </p>
  `

  const html = renderEmailLayout({
    badgeText: 'Document Verified',
    badgeColor: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' },
    title: 'Document Extraction & Verification Passed',
    subtitle: `${documentType} verified by ${ocrEngine}.`,
    bodyContent,
    ctaText: 'Review Live Session',
    ctaUrl: sessionUrl,
  })

  const text = `Hello ${recipientName},

Your document (${documentType}) has been successfully processed and verified by OpenKYC.
OCR Engine: ${ocrEngine}
Extracted Fields: ${fieldCount} attributes validated.

Next step: AML sanctions and knowledge graph risk analysis.
Status link: ${sessionUrl}`

  return sendEmail({ to, subject, html, text })
}

/**
 * 4. AML & Background Checks Completed Email: Sent when the FalkorDB AML pipeline completes.
 */
export async function sendAmlChecksCompletedEmail(params: AmlChecksCompletedParams) {
  const {
    to,
    recipientName = 'Customer',
    recipientType = 'customer',
    sessionId,
    publicToken,
    riskLevel = 'clean',
    riskScore = 0,
    sanctionsStatus = 'clean',
    pepStatus = 'clear',
    matchedEntities = [],
    adverseMediaCount = 0,
    timestamp = Date.now(),
  } = params

  const sessionUrl = sessionId
    ? `${config.APP_URL}/sessions/${sessionId}${publicToken ? `?token=${publicToken}` : ''}`
    : config.APP_URL

  const dateStr = new Date(timestamp).toLocaleString()
  const isLowRisk = riskLevel === 'clean' || riskLevel === 'low'
  const subject = `AML & Background Screening Complete — OpenKYC`

  const badgeColor = isLowRisk
    ? { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' }
    : { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444' }

  const bodyContent = `
    <p style="margin:0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      Automated Anti-Money Laundering (AML), international sanctions lists, politically exposed persons (PEP), and knowledge graph checks have completed for your file.
    </p>

    <!-- Screening Summary Grid -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#27272a;border-radius:10px;border:1px solid #3f3f46;margin:16px 0 20px 0;padding:16px;">
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">Risk Assessment:</td>
        <td style="font-size:13px;font-weight:700;color:${isLowRisk ? '#34d399' : '#f87171'};text-align:right;padding:6px 0;text-transform:uppercase;">
          ${riskLevel} (Score: ${riskScore}/100)
        </td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">Global Sanctions Lists (OFAC/UN/EU):</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:6px 0;">${sanctionsStatus.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">PEP (Politically Exposed Persons):</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:6px 0;">${pepStatus.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">Graph Network Linkages:</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:6px 0;">${matchedEntities.length === 0 ? 'No suspicious nominees or shared subnets' : `${matchedEntities.length} graph relation(s)`}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">Adverse Media Scan:</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:6px 0;">${adverseMediaCount === 0 ? 'Clear (0 adverse reports)' : `${adverseMediaCount} mention(s) analyzed`}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#a1a1aa;padding:6px 0;">Screening Completed:</td>
        <td style="font-size:12px;color:#ffffff;text-align:right;padding:6px 0;">${dateStr} (${recipientType === 'employee' ? 'Employee' : 'Customer'})</td>
      </tr>
    </table>

    <p style="margin:16px 0 0 0;font-size:13px;color:#a1a1aa;">
      ${
        isLowRisk
          ? 'Your profile meets all automated regulatory compliance criteria and is proceeding to final verification confirmation.'
          : 'Your file has been routed for standard compliance officer secondary review.'
      }
    </p>
  `

  const html = renderEmailLayout({
    badgeText: isLowRisk ? 'AML Screening Clear' : 'AML Screening Completed',
    badgeColor,
    title: 'AML & Background Checks Concluded',
    subtitle: `Graph-native risk screening completed for session ${sessionId || ''}`,
    bodyContent,
    ctaText: 'View Verification Report',
    ctaUrl: sessionUrl,
  })

  const text = `Hello ${recipientName},

AML and background screening has completed for your OpenKYC verification.
Risk Level: ${riskLevel} (Score: ${riskScore}/100)
Sanctions: ${sanctionsStatus}
PEP: ${pepStatus}

View full report: ${sessionUrl}`

  return sendEmail({ to, subject, html, text })
}

/**
 * 5. Final Verification Decision Rendered: Approved or Rejected.
 */
export async function sendVerificationDecisionEmail(params: VerificationDecisionParams) {
  const {
    to,
    recipientName = 'Customer',
    recipientType = 'customer',
    sessionId,
    publicToken,
    decision,
    notes = '',
    reviewerName,
    timestamp = Date.now(),
  } = params

  const isApproved = decision === 'approved'
  const dateStr = new Date(timestamp).toLocaleString()
  const sessionUrl = sessionId
    ? `${config.APP_URL}/sessions/${sessionId}${publicToken ? `?token=${publicToken}` : ''}`
    : config.APP_URL

  const subject = isApproved
    ? `Verification Approved — OpenKYC Process Completed Successfully`
    : `OpenKYC Verification Update — Action Required`

  const badgeColor = isApproved
    ? { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: '#10b981' }
    : { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: '#ef4444' }

  const bodyContent = `
    <p style="margin:0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
    <p style="margin:0 0 16px 0;">
      ${
        isApproved
          ? 'Congratulations! Your identity and compliance verification has been officially reviewed and <strong>APPROVED</strong>.'
          : 'Thank you for submitting your verification details. After reviewing your submission, our compliance department requires additional information or clarification.'
      }
    </p>

    <!-- Decision Banner -->
    <div style="background-color:#27272a;border-radius:10px;border-left:4px solid ${isApproved ? '#10b981' : '#ef4444'};padding:16px;margin:20px 0;">
      <div style="font-size:12px;font-weight:700;color:${isApproved ? '#34d399' : '#f87171'};text-transform:uppercase;margin-bottom:4px;">
        Final Status: ${isApproved ? 'VERIFIED & APPROVED' : 'SUBMISSION REJECTED / NEEDS ATTENTION'}
      </div>
      ${
        notes
          ? `<div style="font-size:13px;color:#e4e4e7;margin-top:6px;"><strong>Reviewer Notes:</strong> "${notes}"</div>`
          : ''
      }
      ${
        reviewerName
          ? `<div style="font-size:11px;color:#a1a1aa;margin-top:4px;">Reviewed by: ${reviewerName} &bull; Date: ${dateStr} &bull; Type: ${recipientType === 'employee' ? 'Employee' : 'Customer'}</div>`
          : `<div style="font-size:11px;color:#a1a1aa;margin-top:4px;">Recorded on: ${dateStr} &bull; Type: ${recipientType === 'employee' ? 'Employee' : 'Customer'}</div>`
      }
    </div>

    <p style="margin:16px 0 0 0;font-size:13px;color:#a1a1aa;">
      ${
        isApproved
          ? 'Your verified profile is now active with full permissions. No further steps are needed.'
          : 'You may re-attempt document submission or reach out to your compliance administrator with any questions.'
      }
    </p>
  `

  const html = renderEmailLayout({
    badgeText: isApproved ? 'Verified & Approved' : 'Review Decision',
    badgeColor,
    title: isApproved ? 'Identity Verification Approved' : 'Verification Update: Action Required',
    subtitle: isApproved
      ? 'Your verification was reviewed and successfully validated.'
      : 'Please review the comments from our compliance team.',
    bodyContent,
    ctaText: isApproved ? 'View Verification Certificate' : 'Review & Update Documents',
    ctaUrl: sessionUrl,
  })

  const text = `Hello ${recipientName},

Your OpenKYC verification decision has been recorded: ${decision.toUpperCase()}.
Notes: ${notes || 'None'}

Access details: ${sessionUrl}`

  return sendEmail({ to, subject, html, text })
}
