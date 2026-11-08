# LMAS — Laboratory Management & Accounting System

Offline-first Windows desktop application for a medical diagnostic laboratory in
Dera Ismail Khan, Khyber Pakhtunkhwa, Pakistan. Built from `PRD.md`.

**Status:** v1.0.0 — all five checkpoints complete. The Windows installer is
built with `npm run dist:win` on a Windows machine. See `IMPLEMENTATION_PLAN.md`.

## Tech stack

Electron + React 18 + TypeScript (strict) + Vite (`electron-vite`) + Tailwind CSS +
SQLite (`better-sqlite3`, integer-paisa money) + Zod + SheetJS (`xlsx` exports) + Vitest.

## Getting started (Windows)

Prerequisites: Node.js 20+ and npm.

```powershell
npm install
npm run rebuild:deps   # binds better-sqlite3 to Electron's ABI (once after install)
npm run dev            # launch the app in development
```

### Building the installer

On a Windows machine (Wine is only needed for cross-building from Linux, so
the packaged NSIS installer is produced there):

```powershell
npm install
npm run dist:win       # → dist\LMAS Setup 1.0.0.exe (icon, shortcuts, version info)
```

The installer offers per-user or per-machine installation, creates desktop
and start-menu shortcuts, and the app itself carries the LMAS icon and
version metadata.

The database is created automatically in `%APPDATA%\LMAS\lmas.db` for packaged
builds, or `dev-data\lmas.db` in development. First login:

- Username: `admin`
- Password: `Admin@123`  (flagged "must change"; full user management arrives in Checkpoint 4)

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development launch with HMR |
| `npm run build` | Production build (main + preload + renderer) |
| `npm run typecheck` | Strict TypeScript check for both environments |
| `npm test` | Vitest unit/integration suite (Node ABI — after `rebuild:deps` run `npm rebuild better-sqlite3` first) |
| `npm run smoke` | Launch built app with `--smoke` (verifies DB + exits 0; Electron ABI) |
| `npm run rebuild:deps` | Rebuild native deps against Electron |
| `npm run dist:win` | Build the Windows NSIS installer (Checkpoint 5) |

## Documentation

| File | Contents |
| --- | --- |
| `PRD.md` | Product requirements (source document) |
| `AGENTS.md` | Instructions & status for the coding agent |
| `ARCHITECTURE.md` | Architecture, IPC surface, security model |
| `DATABASE.md` | Schema, ERD, conventions, integrity rules |
| `ACCOUNTING_RULES.md` | Financial formulas, rounding, policies |
| `IMPLEMENTATION_PLAN.md` | Five-checkpoint plan and progress |
| `TESTING.md` | Test cases and results |
| `CHANGELOG.md` | Version history |
| `USER_GUIDE.md` | Staff instructions |
