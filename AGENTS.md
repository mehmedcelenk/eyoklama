# AGENTS.md — Constitution & Engineering Guidelines for AI Agents

> **Project:** eYoklama (v3.0.0)  
> **Architecture:** Vibecoding-Safe Native DOM Architecture & Multi-Tenant Layered Supabase / PWA  
> **Current Phase:** **MVP (Streamlined Rock-Solid Attendance Baseline)**  
> **Status:** Strictly Enforced Constitution

---

## 0. Autonomous Execution Directive (The Agent Contract)

Whenever the user gives ANY task, feature request, or bug fix (e.g., "Add student modal", "Fix attendance export"):
1. **Never wait for manual prompt priming:** The agent already has full awareness of `architecture.md`, `state.md`, and `SCHEMA_AND_AUTH.md`.
2. **Implicit Execution Pipeline:** Every task must automatically run through:
   - **Step 1 (Scope & State Mapping):** Identify which domain slice (`session`, `navigation`, `attendance`, `history`, `roster`, `grades`, `auth`) is affected according to `state.md` and database schema in `SCHEMA_AND_AUTH.md`.
   - **Step 2 (MVP Scope Guard):** We are strictly in the **MVP phase**. Do NOT activate or expose Veli (Parent) or Not & Kanaat (Grades) UI in MVP unless explicitly instructed by the user.
   - **Step 3 (Line-Limit Pre-Check):** Check target file line counts (`src/` and `tests/`). If a file will reach $\ge 280$ lines, extract a sub-module (`*-actions.ts`, `*-search.ts`, `*-drawer.ts`, etc.) before adding lines.
   - **Step 4 (Implementation):** Implement with Native DOM (zero frameworks, zero inline handlers, clean event delegation).
   - **Step 5 (Automated Verification Gate):** Always run `npm run check:arch`, `npm run check:types`, and `npm run test` before declaring completion.
3. **Preserve Integrity:** Never introduce `any`, never skip test assertions, and never bypass architectural gates.

---

## 1. Prime Directives (The Absolute Invariants)

All AI agents operating within this repository MUST treat the following rules as immutable laws. Any pull request or modification that violates these constraints is considered defective by definition.

### 1.1. The 350-Line Limit
- **Rule:** No source file (`.ts`, `.js`, `.css`) in `src/` or `tests/` may exceed **350 lines of code**.
- **Enforcement:** `npm run check:arch` checks line counts automatically.
- **Remediation:** If a module approaches ~280-300 lines, extract cohesive sub-modules (e.g. split into `*-actions.ts`, `*-search.ts`, `*-drawer.ts`, `*-management.ts`, or helper functions in `shared/`). Never disable or bypass this rule.

### 1.2. Strict 4-Tier Layer Isolation (Unidirectional Dependency Flow)
Imports must flow strictly downwards. An upper layer may import from a lower layer, but NEVER vice versa:

```
[ Tier 3: app ]       -> Router, Shell, Store, Bootstrap
      ↓
[ Tier 2: features ]  -> Attendance, History, Lists, Pre-permissions, Settings, Auth (Grades deferred)
      ↓
[ Tier 1: data ]      -> Supabase client/RPC, Storage, Domain Models (types.ts)
      ↓
[ Tier 0: shared ]    -> Sanitization, Validators, Formatters, Date, CSV, Toast
```

- `shared/` must NEVER import from `data/`, `features/`, or `app/`.
- `data/` may only import from `shared/`.
- `features/` may import from `data/` and `shared/`, but NEVER from `app/` or sibling features without going through a shared interface or store.
- Circular dependencies are strictly prohibited (verified by `scripts/check-architecture.mjs`).

### 1.3. Native DOM & Zero Inline Event Handlers
- **No Heavy Frameworks:** Pure TypeScript manipulating the Native DOM. Do not add React, Vue, Svelte, or other frontend frameworks.
- **Zero Inline Event Handlers:** Do NOT use `onclick="..."`, `onchange="..."`, or any `on*` attributes in `index.html` or generated HTML templates.
- **Event Delegation:** Use clean DOM event listeners (`addEventListener`) or declarative event delegation patterns configured in view initialization.

### 1.4. Phased Scope Invariant (MVP vs Future Releases)
The project follows a phased release roadmap. Agents must respect phase boundaries:
- **Phase 0 — MVP (CURRENT):** Rock-solid core attendance system:
  - Hoca Girişi: Hoca Adı + PIN (with 7-day remembered continuation).
  - Kurum Girişi: Yönetici Şifresi ile anında giriş.
  - Sınıf & Öğrenci Yönetimi (Class Management Drawer + Pool).
  - 3-Durumlu Yoklama (Var / Yok / İzinli) ve 45s heartbeat kilidi.
  - Günün İzinlileri (Pre-permissions).
  - Geçmiş Yoklamalar (Gün/Hafta/Ay gruplama, Excel/Word/PDF export).
  - PWA çevrimdışı önbellekleme ve Native DOM mimarisi.
- **Phase 1 — v1.0.0 (NEXT):** Physical / Hybrid yoklama şablonları (dijital yoklamayı basılı deftere kolay aktarma, aylık çıktı şablonları).
- **Phase 2 — v2.0.0 (DEFERRED):** Veli Bilgilendirme & Yoklama Sonuçları Sorgu Portalı (`#parentQuerySection`).
- **Phase 3 — v2.2.0 (DEFERRED):** Not & Kanaat / Karne Sistemi (`#topGradesBtn`, `#gradesPage`).
- **Phase 4 — v3.0.0 (FUTURE):** Çoklu kurum ve bağımsız hoca araçları ekosistemi.

> [!IMPORTANT]
> In MVP, Veli and Notlar code is preserved in the repository for future activation, but MUST remain hidden in `index.html` (`class="hidden"`) and unused in live RPC calls.

---

## 2. Directory Layout & Layer Responsibilities

```
eyoklama/
├── scripts/
│   ├── check-architecture.mjs           # Linter for line counts, layer flow, cycles, inline HTML handlers
│   ├── setup-complete-schema.sql        # Canonical Supabase database schema
│   ├── migrate-to-multi-tenant.sql      # Multi-tenant institution migration & isolation
│   ├── setup-grades-schema.sql          # Grades & assessment schema extensions (v2.2)
│   ├── setup-school-pool-schema.sql     # School-wide master student pool (school_students)
│   └── setup-teacher-approvals-schema.sql # Passwordless TC-based teacher registration & device approval
├── src/
│   ├── shared/                          # Tier 0: Pure utilities, TC validator, CSV parser, sanitizers
│   ├── data/                            # Tier 1: Supabase client/RPC calls, local storage, types.ts
│   ├── features/                        # Tier 2: Domain feature modules (views, components, logic)
│   │   ├── attendance/                  # Taking attendance, 3-state cycling, 45s heartbeat lock
│   │   ├── auth/                        # MVP Login (Hoca PIN, Admin password, session.ts, logout.ts)
│   │   ├── grades/                      # Grades & parent report (Code preserved, UI hidden in MVP)
│   │   ├── history/                     # Past attendance records, grouping (day/week/month), PDF export
│   │   ├── lists/                       # Class lists, CSV student import, Master Pool selector
│   │   ├── pre-permissions/             # Pre-excused students with lock badges
│   │   └── settings/                    # Institution settings, Class drawer, School pool management
│   ├── app/                             # Tier 3: Shell, 6-Slice Store, Router, App Bootstrap
│   └── styles/                          # Modular CSS stylesheets (base, layout, attendance, history, admin)
├── tests/
│   ├── unit/                            # Vitest unit test suite (utilities, 6-slice store, auth, pool)
│   └── e2e/                             # Playwright end-to-end hermetic test suite (4-tier methodology)
├── SCHEMA_AND_AUTH.md                   # Canonical Multi-Tenant Database & Teacher Auth Specification
└── index.html                           # Single Page Application HTML entry point
```

---

## 3. Database, Multi-Tenancy & Auth Conventions

1. **Multi-Tenant Isolation (`institution_id`):**
   - Every core table (`lists`, `students`, `attendance_sessions`, `school_students`, `student_grades`, `teacher_registrations`, `app_sessions`) is scoped by `institution_id` (foreign key to `public.institutions`).
   - Consult `SCHEMA_AND_AUTH.md` before modifying any database table or authentication flow.

2. **MVP Authentication Flow:**
   - The live Postgres function `app_login` expects 3 parameters: `(p_name, p_pin, p_device_token)`.
   - Teacher login: `p_name = teacherName`, `p_pin = teacherPin`.
   - Admin login: `p_name = 'admin'`, `p_pin = adminPassword`.
   - Remembered continuation: `p_name = ''`, `p_pin = ''`.
   - Never send unsupported 4th parameters (`p_institution_slug`) to `app_login` unless the live DB schema cache has been migrated.

3. **Schema & Migrations:**
   - Any database schema change or RPC procedure addition must be placed in `scripts/setup-*.sql` or `scripts/migrate-*.sql`.
   - All tables must have Row Level Security (RLS) policies defined.
   - Use atomic Postgres RPC functions (`SECURITY DEFINER`) for sensitive operations.

4. **Data Model Synchronization:**
   - Whenever SQL schema changes are made, update `src/data/models/types.ts` and `src/data/supabase/rpc.ts` immediately to reflect TypeScript type safety.
   - Do not use `any`. Explicitly type all database parameters and RPC responses.

---

## 4. Testing & Verification Requirements

No task is complete until the following verification gate passes without errors:

```bash
# 1. Verify architecture rules, line counts, layer boundaries, and run unit tests:
npm run check

# 2. Verify type safety:
npm run check:types

# 3. Build verification:
npm run build
```

### Writing New Tests
- **Unit Tests (`tests/unit/*.test.ts`):** Write unit tests for all pure functions in `shared/`, 6-slice state transitions in `app/store.ts`, and RPC wrapper behavior.
- **E2E Tests (`tests/e2e/*.spec.ts`):** Use hermetic route interception via `page.route()` for Supabase requests. Never depend on live external networks in automated tests. Maintain tests $\le 350$ lines.

---

## 5. Agent Workflow & Operational Protocol

When assigned a task:
1. **Analyze First:** Inspect existing types in `src/data/models/types.ts`, schema rules in `SCHEMA_AND_AUTH.md`, and state slices in `.agents/rules/state.md` before modifying code.
2. **Respect MVP Boundaries:** Focus exclusively on the active MVP / v1 attendance features. Do not leak unfinished v2 parent/grades UI into the user flow.
3. **Preserve Comments & Docs:** Keep existing non-conflicting comments and docstrings intact.
4. **Execute Clean Refactors:** If a file will exceed 350 lines after your change, split it before adding more lines.
5. **Run Verification:** Execute `npm run check:arch`, `npm run check:types`, and `npm run test` before declaring completion.
6. **No Breaking Regressions:** Ensure existing PWA offline support, multi-tenant isolation, local caching, and attendance locking semantics remain intact.
