// Computes the exact dependency closure needed by the *server runtime*
// (root "dependencies" + workspace package deps) from package-lock.json,
// then deletes every top-level node_modules entry that is not in it.
//
// Rationale: npm ci alone can't slim this tree — auto-installed peer deps
// (better-auth pulls drizzle-kit, react, ...) and frontend-only packages
// that vite already bundles into build/ would otherwise ship in the image.
// Peer dependencies are deliberately NOT followed: audited — the server
// imports none of them at runtime.
//
// Usage: PRUNE_NODE_MODULES=1 node scripts/prune-runtime-deps.mjs <node_modules-dir>
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repo = new URL('..', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('package.json', repo), 'utf8'))
const lock = JSON.parse(await readFile(new URL('package-lock.json', repo), 'utf8'))

const target = path.resolve(process.argv[2] ?? '.')
if (path.basename(target) !== 'node_modules')
  throw new Error(`Refusing to prune ${target}: pass the node_modules directory`)
if (process.env.PRUNE_NODE_MODULES !== '1')
  throw new Error('Set PRUNE_NODE_MODULES=1 to run (safety guard)')

// Package graph: every lockfile entry that lives inside node_modules at any
// depth contributes dependency edges when it is reachable.
const entries = new Map()
for (const [key, entry] of Object.entries(lock.packages ?? {}))
  if (key.includes('node_modules/')) entries.set(key, entry)

let workspaceDeps = []
try {
  for (const dir of await readdir(path.join(repo.pathname, 'packages'))) {
    try {
      const sub = JSON.parse(
        await readFile(path.join(repo.pathname, 'packages', dir, 'package.json'), 'utf8'),
      )
      workspaceDeps.push(...Object.keys(sub.dependencies ?? {}))
    } catch {
      // Workspace without a package.json manifest; skip.
    }
  }
} catch {
  // No packages/ directory; skip.
}

const keep = new Set()
const queue = [...Object.keys(pkg.dependencies ?? {}), ...workspaceDeps]
while (queue.length) {
  const name = queue.pop()
  if (keep.has(name)) continue
  keep.add(name)
  // Every installed copy of this package (nested versions included) may
  // declare further deps that must stay available at the top level.
  for (const [key, entry] of entries)
    if (packageNameOf(key) === name) queue.push(...depsOf(entry))
}

function depsOf(entry) {
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
  ]
}
function packageNameOf(key) {
  const marker = 'node_modules/'
  const tail = key.slice(key.lastIndexOf(marker) + marker.length)
  return tail.startsWith('@') ? tail.split('/').slice(0, 2).join('/') : tail.split('/')[0]
}

const removed = []
for (const dir of await readdir(target, { withFileTypes: true })) {
  const scopes = dir.isDirectory() && dir.name.startsWith('@')
    ? await readdir(path.join(target, dir.name)).then((subs) => subs.map((s) => `${dir.name}/${s}`))
    : [dir.name]
  for (const name of scopes) {
    if (keep.has(name)) continue
    await rm(path.join(target, name), { recursive: true, force: true })
    removed.push(name)
  }
}

// Leave a marker so builds and reviews can see what was pruned and why.
await writeFile(
  path.join(target, '.pruned.json'),
  JSON.stringify({ kept: [...keep].sort(), removed: removed.sort() }, null, 2),
)
console.log(`Pruned ${removed.length} top-level packages from node_modules`)
