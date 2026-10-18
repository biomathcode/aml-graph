import 'dotenv/config'
import { z } from 'zod'
export const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    APP_URL: z.string().url().default('http://localhost:3000'),
    PORT: z.coerce.number().default(3001),
    STORAGE_PATH: z.string().default('./data/uploads'),
    INDRA_OCR_URL: z.string().default(process.env.INDRA_OCR_URL || 'http://localhost:8001'),
    RESEND_API_KEY: z.string().optional().default(process.env.RESEND_API_KEY || process.env.RESENT_API_KEY || ''),
    RESEND_FROM: z.string().optional().default(process.env.RESEND_FROM || process.env.SMTP_FROM || 'OpenKYC <onboarding@resend.dev>'),
    NODE_ENV: z.string().default('development'),
  })
  .parse(process.env)
