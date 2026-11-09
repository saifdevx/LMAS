/**
 * Rebuild better-sqlite3 for ELECTRON (not for the Node.js running npm).
 * Deletes any stale binary first, so an old Node-ABI build can never be reused.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'node_modules', 'better-sqlite3', 'build')
console.log('[rebuild-electron] Removing old better-sqlite3 build folder...')
fs.rmSync(buildDir, { recursive: true, force: true })

console.log('[rebuild-electron] Running electron-builder install-app-deps (targets installed Electron)...')
const r = spawnSync('npx', ['electron-builder', 'install-app-deps'], { cwd: root, stdio: 'inherit', shell: true })
if (r.status !== 0) {
  console.error('[rebuild-electron] FAILED. Do not build the installer until this passes.')
  process.exit(r.status || 1)
}
const check = spawnSync(
  process.execPath,
  [path.join(__dirname, 'verify-native.cjs'), path.join(buildDir, 'Release', 'better_sqlite3.node')],
  { stdio: 'inherit' }
)
process.exit(check.status || 0)
