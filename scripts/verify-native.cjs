/**
 * Checks which Node/Electron ABI a native .node file was compiled for.
 * Native modules export a symbol named node_register_module_v<ABI>.
 * Electron 33.x = ABI 130. Node 26 = ABI 147 (WRONG for the app).
 * Usage: node scripts/verify-native.cjs [path-to-better_sqlite3.node]
 */
const fs = require('fs')
const path = require('path')

const EXPECTED_ABI = 130 // Electron 33.x. Update only if the Electron major version changes.
const root = path.join(__dirname, '..')
const file =
  process.argv[2] ||
  path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')

if (!fs.existsSync(file)) {
  console.error(`[verify-native] FAIL: file not found:\n  ${file}`)
  process.exit(1)
}
const text = fs.readFileSync(file).toString('latin1')
const found = [...new Set([...text.matchAll(/node_register_module_v(\d+)/g)].map((m) => Number(m[1])))]
console.log(`[verify-native] ${file}\n[verify-native] ABI found: ${found.join(', ') || 'none'} (expected ${EXPECTED_ABI})`)
if (found.length !== 1 || found[0] !== EXPECTED_ABI) {
  console.error('[verify-native] FAIL: wrong ABI. This binary will crash in Electron.')
  process.exit(1)
}
console.log('[verify-native] OK: binary matches Electron.')
