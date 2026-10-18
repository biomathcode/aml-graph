import { createHmac } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import https from 'node:https'
import net from 'node:net'
import { pool } from './db/index.js'
import { settings } from './repository.js'
import { sendEmail } from './auth.js'
import { runSessionOCR } from './ocr.js'
// Exact administrator allowlist prevents customer-controlled outbound destinations.
export async function deliver(
  url: string,
  body: string,
  secret: string,
  eventId: string,
) {
  const target = new URL(url)
  const hosts = (process.env.WEBHOOK_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    !hosts.includes(target.hostname)
  )
    throw new Error('Webhook host must be in WEBHOOK_ALLOWED_HOSTS')
  const resolved = await lookup(target.hostname)
  const ip = resolved.address
  if (
    net.isIP(ip) !== 4 ||
    /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(
      ip,
    )
  )
    throw new Error('Webhook address must be public IPv4')
  const timestamp = String(Math.floor(Date.now() / 1000)),
    signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')
  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: 'POST',
        lookup: (_host, _options, callback) => callback(null, ip, 4),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-OpenKYC-Event-ID': eventId,
          'X-OpenKYC-Timestamp': timestamp,
          'X-OpenKYC-Signature': signature,
        },
        timeout: 10000,
      },
      (response) => {
        response.resume()
        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        )
          resolve()
        else reject(new Error(`Webhook returned ${response.statusCode}`))
      },
    )
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error('Webhook timeout')))
    request.end(body)
  })
}
export function startDeliveryLoop() {
  let running = false,
    stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      // Claims expire after a crash. At-least-once delivery uses a stable event ID.
      const { rows } = await pool.query(
        `UPDATE jobs SET status='delivering',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM jobs WHERE kind='webhook' AND attempts<5 AND available_at<=now() AND (status='pending' OR (status='delivering' AND updated_at<now()-interval '2 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING *`,
      )
      for (const job of rows) {
        try {
          const prefs = await settings(job.owner_id)
          if (prefs.webhookUrl) {
            if (!prefs.webhookSecret)
              throw new Error('Create a webhook signing secret in Settings')
            await deliver(
              prefs.webhookUrl,
              JSON.stringify({ id: job.id, ...job.payload }),
              prefs.webhookSecret,
              job.id,
            )
          }
          // Email notifications are best-effort: a single invalid recipient
          // (e.g. sandbox/test domains rejected by the mail provider) must
          // never fail or requeue the whole delivery job.
          if (prefs.emailNotifications) {
            const user = await pool.query(
              'SELECT email FROM "user" WHERE id=$1',
              [job.owner_id],
            )
            if (user.rows[0]) {
              try {
                await sendEmail(
                  user.rows[0].email,
                  'OpenKYC verification update',
                  `${job.payload.event}: ${job.entity_id}`,
                )
              } catch (mailError) {
                console.warn('Email notification failed (ignored):', mailError instanceof Error ? mailError.message : mailError)
              }
            }
          }
          await pool.query(
            'UPDATE jobs SET status=$2,updated_at=now() WHERE id=$1',
            [
              job.id,
              prefs.webhookUrl || prefs.emailNotifications
                ? 'delivered'
                : 'skipped',
            ],
          )
        } catch (error) {
          await pool.query(
            "UPDATE jobs SET status=$2,last_error=$3,available_at=now()+($4 * interval '1 second'),updated_at=now() WHERE id=$1",
            [
              job.id,
              job.attempts >= 5 ? 'failed' : 'pending',
              error instanceof Error ? error.message : 'Delivery failed',
              Math.pow(2, job.attempts) * 30,
            ],
          )
        }
      }
    } catch {
      console.error('Notification delivery unavailable')
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, 5000)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

// Dedicated loop for background OCR jobs — mirrors at-least-once delivery semantics.
export function startOCRLoop() {
  let running = false,
    stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      // Claims expire after a crash; re-claimed after 5 minutes of silence.
      const { rows } = await pool.query(
        `UPDATE jobs SET status='delivering',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM jobs WHERE kind='ocr' AND attempts<5 AND available_at<=now() AND (status='pending' OR (status='delivering' AND updated_at<now()-interval '5 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 3) RETURNING *`,
      )
      for (const job of rows) {
        try {
          await runSessionOCR(job.payload.sessionId, job.payload.ownerId)
          await pool.query(
            'UPDATE jobs SET status=$2,updated_at=now() WHERE id=$1',
            [job.id, 'delivered'],
          )
        } catch (error) {
          await pool.query(
            "UPDATE jobs SET status=$2,last_error=$3,available_at=now()+($4 * interval '1 second'),updated_at=now() WHERE id=$1",
            [
              job.id,
              job.attempts >= 5 ? 'failed' : 'pending',
              error instanceof Error ? error.message : 'OCR failed',
              Math.pow(2, job.attempts) * 30,
            ],
          )
        }
      }
    } catch {
      console.error('OCR delivery unavailable')
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, 5000)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
