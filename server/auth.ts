import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { pool } from './db/index.js'
import { config } from './config.js'
import { sendEmail as mailerSendEmail } from './mailer.js'

export async function sendEmail(to: string, subject: string, text: string) {
  const result = await mailerSendEmail({ to, subject, text })
  if (!result.success) {
    throw new Error(result.error || 'Failed to send authentication email')
  }
}
export const auth = betterAuth({
  database: pool,
  baseURL: config.APP_URL,
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) =>
      sendEmail(
        user.email,
        'Reset your OpenKYC password',
        `Reset your password: ${url}`,
      ),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) =>
        sendEmail(email, 'Sign in to OpenKYC', `Sign in: ${url}`),
    }),
  ],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      '/get-session': false,
      '/sign-in/email': { window: 60, max: 15 },
      '/sign-up/email': { window: 60, max: 15 },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ['x-openkyc-client-ip'] },
    useSecureCookies: config.APP_URL.startsWith('https:'),
  },
})
