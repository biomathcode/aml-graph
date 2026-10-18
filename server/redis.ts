import { Redis } from 'ioredis'
import { config } from './config.js'
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 })
redis.on('error', () => console.error('Redis connection unavailable'))
export async function notify(ownerId: string) {
  await redis.publish(`updates:${ownerId}`, 'changed').catch(() => {})
}
