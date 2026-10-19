# Architecture & Structural Integrity Constitution

This rule governs the physical layout, file limits, module isolation, multi-tenant boundaries, and UI event binding principles of the application.

## 0. Autonomous Agent Execution Checklist
Before making ANY code changes:
1. **Check Line Count:** Run `wc -l` on the file to be edited. If already $\ge 280$ lines, extract helper sub-modules first (`*-actions.ts`, `*-management.ts`, `*-selector.ts`, `*-auth.ts`).
2. **Check Layer Rank:** Ensure new imports strictly obey `app` (3) $\rightarrow$ `features` (2) $\rightarrow$ `data` (1) $\rightarrow$ `shared` (0).
3. **Check Multi-Tenant & Schema Rules:** Consult `SCHEMA_AND_AUTH.md` when touching auth, institution context, student pools, or RPCs.
4. **No Inline HTML Events:** Use `addEventListener` or event delegation (`data-action`).
5. **Run Verification:** Conclude every change with `npm run check:arch && npm run check:types && npm run test`.

---

## 1. Physical Constraints (The 350-Line Limit)
- **Hard Limit:** No source file (`.ts`, `.js`, `.css`) in `src/` or `tests/` may exceed **350 lines**.
- **Proactive Decomposition (~280-300 lines):** Split modules *before* hitting 350 lines.
  - Decompose views into focused sub-modules:
    - `auth/`: `auth-view.ts`, `teacher-auth.ts`, `rate-limit.ts`
    - `lists/`: `lists-view.ts`, `import-roster.ts`, `pool-selector.ts`
    - `settings/`: `settings-view.ts`, `admin-actions.ts`, `pool-management.ts`, `teacher-management.ts`
    - `attendance/`: `attendance-view.ts`, `attendance-actions.ts`, `attendance-search.ts`, `student-card.ts`, `heartbeat.ts`
    - `history/`: `history-view.ts`, `edit-drawer.ts`, `export-actions.ts`, `grouping.ts`, `pdf-*.ts`
    - `grades/`: `grades-view.ts`, `parent-report-view.ts`
  - Extract pure utilities to `src/shared/`.
- **Enforcement:** Verified automatically by `scripts/check-architecture.mjs`. Bypassing or disabling line checks is strictly forbidden.

## 2. 4-Tier Layer Isolation (Strict Unidirectional Flow)
Dependencies strictly flow downwards:
```
[ Tier 3: app ]       -> Router, Shell, 6-Slice Store, Bootstrap
      ↓
[ Tier 2: features ]  -> Attendance, History, Lists, Grades, Pre-permissions, Settings, Auth
      ↓
[ Tier 1: data ]      -> Supabase RPC/client, Storage, Device Token, Domain Models (types.ts)
      ↓
[ Tier 0: shared ]    -> Pure utilities (TC validator, student validator, date, CSV, sanitizers, formatters)
```
- **Layer Invariants:**
  - `src/shared/` must never import from `data/`, `features/`, or `app/`.
  - `src/data/` may only import from `src/shared/`.
  - `src/features/` may import from `data/` and `shared/`. Never import from `app/` or directly from sibling feature directories. Feature communication must route via store (`FeatureContext`) or shared interfaces.
  - `src/app/` coordinates all features, routing, and central bootstrap.
- **Circular Dependencies:** 0 tolerance for circular imports across all modules.

## 3. Native DOM & Zero Inline Event Handlers
- **No Heavy Frameworks:** Native DOM manipulation only (Vanilla TypeScript). Never install or introduce React, Vue, Svelte, or similar frameworks.
- **Zero Inline Event Handlers:** Never use `onclick="..."`, `onchange="..."`, or any `on*` attributes in `index.html` or generated HTML templates.
- **Event Delegation:**
  - Attach listeners via `addEventListener` during view initialization or element construction.
  - For dynamic lists (e.g., student cards, history rows, pool selectors, teacher approval rows), bind a single event listener to the parent container using `data-*` attributes (`e.target.closest('[data-action]')`).
  - Always clean up polling intervals (e.g., teacher approval polling) or timers when views unmount or transition.

## 4. Verification Gate
No architectural change or feature implementation is complete without:
1. `npm run check:arch` (Line counts, layer flow, circular imports, inline events)
2. `npm run check:types` (Strict TypeScript verification)
3. `npm run test` (Unit test suite execution)
