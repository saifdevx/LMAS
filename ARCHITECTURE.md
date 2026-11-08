# ARCHITECTURE.md

## 1. Overview

LMAS is an offline-first Electron desktop application. All data lives in a
local SQLite database; nothing requires an internet connection at runtime.

```
┌──────────────────────────── Electron main process (Node.js) ───────────────────────────┐
│  ipc/ (Zod-validated handlers)  →  services/ (auth, settings, dashboard, audit)        │
│                                        │                                               │
│                                  db/ connection + migrator + seed                      │
│                                        │                                               │
│                                  SQLite  lmas.db  (WAL, foreign_keys=ON)               │
└──────────────▲─────────────────────────────────────────────────────────────────────────┘
               │ contextBridge IPC (window.lmas) — typed, validated
┌──────────────┴─────────────────────────────────────────────────────────────────────────┐
│  Preload: minimal bridge, no Node access                                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Renderer (React + Tailwind): Login · Shell (sidebar/header) · Dashboard · Settings    │
│  shared/commission.ts + shared/money.ts — the ONLY financial calculation code          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Money representation | Integer **paisa** everywhere | Exact arithmetic; PKR has 100 paisa (PRD §6.1.2) |
| Commission rates | Integer **basis points** (50% = 5000) | Supports 12.5%-style rates without floats |
| SQLite driver | `better-sqlite3` (externalized native dep) | Synchronous, transactional, well-maintained; Prisma adds heavy binary + engine management for a single-file desktop DB (allowed by PRD §7.1 "or a well-maintained SQLite library") |
| Password hashing | Node built-in **scrypt** (16-byte salt, 64-byte key, timing-safe compare) | Established algorithm (PRD §7.5), zero extra native deps |
| Time storage | `TEXT` local time (`datetime('now','localtime')`), business-day dates as `YYYY-MM-DD` | The lab works in one timezone; daily/weekly reports must follow the wall clock |
| Bundler | `electron-vite` (Vite for main/preload/renderer) | PRD names Vite; unified build with HMR |
| Routing | In-app state routing (no URL router) | Desktop single-window app; avoids a dependency; can be revisited if deep links are ever needed |
| Settings read | `settings:get` is unauthenticated (lab profile only) | Login screen/header branding; contains no sensitive data |
| CSP | Deferred to Checkpoint 5 security review | Dev server/HMR compatibility; noted as a known hardening item |

## 3. IPC surface

### Checkpoint 1 (auth/settings/dashboard)

| Channel | Auth | Permission | Purpose |
| --- | --- | --- | --- |
| `auth:login` | — | — | Verify credentials, create 12h session |
| `auth:session` | token | — | Resume/validate session |
| `auth:logout` | token | — | Destroy session |
| `settings:get` | — | — | Merged settings map |
| `settings:update` | token | `settings.manage` | Validate + update + audit |
| `settings:uploadLogo` | token | `settings.manage` | File dialog → copy to data dir |
| `dashboard:overview` | token | `dashboard.view` | Period aggregates |

### Checkpoint 2 (operations)

| Channel | Permission | Purpose |
| --- | --- | --- |
| `patients:create` / `patients:update` | `patients.manage` | Registration / edit with audit |
| `patients:search` / `patients:get` | `patients.view` | Unified search / full profile |
| `practitioners:list` / `practitioners:account` | `practitioners.view` | List / account summary |
| `practitioners:create` / `practitioners:update` / `practitioners:setActive` | `practitioners.manage` | CRUD |
| `practitioners:updateRate` | `practitioners.manage` | Rate change + immutable history |
| `tests:list` / `testCategories:list` | `lab_tests.view` | Catalog reads |
| `tests:create` / `tests:update` / `tests:setActive` / `testCategories:create` | `lab_tests.manage` | Catalog writes |
| `bills:create` | `billing.manage` (+`billing.discount` for discounts) | One-transaction bill creation |
| `bills:get` / `bills:list` | `billing.view` | Detail / filtered history |
| `bills:addPayment` | `billing.manage` | Full/partial payments, duplicate-guarded |
| `bills:cancel` | `bills.cancel` | Payment-free cancellation + reversal |
| `receipt:print` / `receipt:pdf` | `billing.view` | Thermal/A4 print and PDF export |

All inputs are Zod-parsed (`src/main/ipc/schemas.ts`); failures return a single
readable error message to the renderer. Services re-verify money-critical
permissions (defense in depth).

## 4. Security model (PRD §7.5)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`; preload exposes exactly six functions.
- `will-navigate` and `window.open` are denied; single-instance lock; the
  application menu is removed in packaged builds.
- Sessions: 32-byte random tokens in main-process memory, 12-hour expiry,
  permissions reloaded from the DB on every verification.
- Login failure auditing (`LOGIN_FAILED`) without user enumeration.
- Database stored in `%APPDATA%\LMAS` (packaged) or `dev-data/` (dev);
  `LMAS_DATA_DIR` overrides for tests/portability.
- Audit log is append-only through application code.

## 5. Data integrity mechanisms

- WAL journaling + 5s busy timeout; `foreign_keys = ON` per connection.
- Financial mutations wrapped in transactions (`db.transaction`).
- DB-level guards already enforced by schema: `bills.net = subtotal − discount`
  CHECK, unique `transaction_id` on payments (duplicate-payment guard),
  referred visits require a practitioner, amount positivity CHECKs.
- Migrations run in transactions and bump `PRAGMA user_version`.

## 6. Folder map

```
lmas/
├─ PRD.md, AGENTS.md, ARCHITECTURE.md, DATABASE.md, ACCOUNTING_RULES.md,
│  IMPLEMENTATION_PLAN.md, TESTING.md, CHANGELOG.md, USER_GUIDE.md
├─ electron.vite.config.ts · vitest.config.ts · tailwind.config.js
├─ src/
│  ├─ shared/          money.ts · commission.ts · permissions.ts · api-types.ts
│  ├─ main/            index.ts · paths.ts
│  │  ├─ db/           connection.ts · migrator.ts · migrations.ts · migrations/001_initial_schema.sql · seed.ts
│  │  ├─ lib/          password.ts (scrypt)
│  │  ├─ services/     auth.ts · settings.ts · dashboard.ts · audit.ts
│  │  └─ ipc/          register.ts · schemas.ts
│  ├─ preload/         index.ts (bridge) · index.d.ts (typing)
│  └─ renderer/        index.html
│     └─ src/          App.tsx · main.tsx · api.ts · styles.css
│        ├─ components/  Sidebar · Header · StatCard · PeriodFilter · PagePlaceholder · ui/(button, card, input, label, badge)
│        ├─ pages/       Login · Dashboard · Settings
│        ├─ context/     AuthContext.tsx
│        └─ lib/         navigation.ts · cn.ts
└─ tests/              money · commission · database (36 tests)
```
