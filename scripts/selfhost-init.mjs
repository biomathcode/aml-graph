import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const secret = () => randomBytes(32).toString('hex')
let content = await readFile(new URL('../.env.sample', import.meta.url), 'utf8')
const postgres = secret(),
  redis = secret()
content = content
  .replace('BETTER_AUTH_SECRET=', 'BETTER_AUTH_SECRET=' + secret())
  .replace('POSTGRES_PASSWORD=', 'POSTGRES_PASSWORD=' + postgres)
  .replace('REDIS_PASSWORD=', 'REDIS_PASSWORD=' + redis)
  .replace('openkyc:password@', 'openkyc:' + postgres + '@')
  .replace('redis://:password@', 'redis://:' + redis + '@')
try {
  await writeFile(new URL('../.env', import.meta.url), content, {
    flag: 'wx',
    mode: 0o600,
  })
  console.log(
    'Created .env with random credentials. Start with docker compose up -d --build.',
  )
} catch (e) {
  if (e.code === 'EEXIST')
    console.log('.env already exists; credentials preserved.')
  else throw e
}
