// Bundles the server (server/**, packages/**) into self-contained ESM
// entrypoints under build/server so production images can run plain `node`
// instead of tsx, letting them install dependencies with --omit=dev.
// Node's own modules and every package.json "dependency" stay external —
// they resolve from node_modules in the runtime image.
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const external = Object.keys(pkg.dependencies)

await Promise.all([
  ['server/index.ts', 'build/server/index.js'],
  ['server/db/migrate.ts', 'build/server/migrate.js'],
].map(([entry, outfile]) =>
  build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: true,
    logLevel: 'info',
    external,
  }),
))
