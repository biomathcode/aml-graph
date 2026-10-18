// One-command setup: `npm run setup`
// 1. Generates .env with random secrets (npm run selfhost:init) if missing.
// 2. Builds and starts the whole stack with docker compose.
// 3. Waits until the app health check passes, then prints where to go.
import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const dy = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) {
    console.error(`\n"${cmd} ${args.join(' ')}" failed (exit ${r.status}).`)
    console.error('Tip: see recent container logs with `docker compose logs`.')
    process.exit(r.status ?? 1)
  }
}

dy(process.execPath, ['scripts/selfhost-init.mjs'])
dy('docker', ['compose', 'up', '-d', '--build'])

// Wait for the app to report healthy.
const env = await readFile(new URL('../.env', import.meta.url), 'utf8').then(
  (t) => Object.fromEntries(t.split('\n').filter((l) => /^[A-Z]/.test(l)).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  })),
)
const host = env.BIND_ADDRESS || '127.0.0.1'
const port = env.APP_PORT || '3000'
const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/health`
const deadline = Date.now() + 3 * 60 * 1000
process.stdout.write(`Waiting for the app at ${url} `)
for (;;) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (res.ok) break
  } catch {}
  if (Date.now() > deadline) {
    console.error('\nApp did not become healthy in 3 minutes.')
    console.error('Check logs with `docker compose logs app`.')
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 2000))
  process.stdout.write('.')
}
console.log('\n')
console.log('OpenKYC is running:')
console.log(`  App:       http://localhost:${port}`)
console.log(`  FalkorDB:  redis://127.0.0.1:${env.FALKORDB_PORT || '6380'}`)
console.log('  Logs:      docker compose logs -f app')
console.log('  Stop:      docker compose down')
