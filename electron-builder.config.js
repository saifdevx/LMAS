/**
 * electron-builder configuration.
 *
 * On the Windows build machine (`npm run dist:win`) the executable is
 * stamped with the LMAS icon and version information via rcedit natively.
 * On Linux (CI / sandbox cross-builds) rcedit needs Wine, so it is skipped —
 * the NSIS installer itself still carries the icon, product name and
 * version, and the app runs identically.
 */
module.exports = {
  appId: 'pk.dikhan.lmas',
  productName: 'LMAS',
  copyright: `Copyright © ${new Date().getFullYear()} LMAS Project`,
  directories: {
    output: 'dist'
  },
  files: ['out/**/*'],
  // Native module (better-sqlite3) must be compiled for ELECTRON, never for the
  // Node.js that runs npm. Rebuild explicitly and keep the .node file outside the asar.
  npmRebuild: true,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  asarUnpack: ['**/node_modules/better-sqlite3/**/*.node'],
  // Asar + integrity-resource embedding requires Wine when cross-building on
  // Linux; the official Windows build keeps asar enabled with integrity.
  asar: process.platform === 'win32',
  win: {
    target: ['nsis'],
    icon: 'build/icon.ico',
    signAndEditExecutable: process.platform === 'win32'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'LMAS'
  }
}
