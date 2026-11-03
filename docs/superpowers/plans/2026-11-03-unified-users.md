# Unified Users Implementation Plan

**Goal:** Combine user permissions and customer balances under Users, and remove the unavailable Organizations screen from navigation

**Architecture:** Keep the native users table and detail screens, adding the existing wallet management component as a sibling tab with its existing authorization checks. Redirect the legacy wallet and organization pages to Users without changing database records or backend permission contracts

**Tech Stack:** Next.js static export, React, nuqs, existing dashboard tabs and tables, Vitest

**Constraints:** Preserve role identifiers, wallet accounting, model permissions, Chinese and English, and the current visual style. Wallet management remains restricted to full proxy admins

### Task 1: Consolidate users

- [x] Extend users tests to cover the wallet tab, deep links, and restricted roles, then observe failures
- [x] Add wallet embedding and query-backed tab selection to the native users page
- [x] Route legacy wallet navigation to the consolidated page and link balances back to user permissions
- [x] Rename navigation and relevant user-facing descriptions in both languages

### Task 2: Remove unavailable organization navigation

- [x] Update sidebar behavior tests to reject organization links and observe failure
- [x] Remove the organization menu item and redirect its old page to Users
- [x] Keep organization data, APIs, and unrelated provider organization fields intact

### Task 3: Verify and release

- [x] Run focused tests, production typecheck, lint, and static build
- [x] Request an independent read-only review and resolve actionable findings
- [x] Deploy a UI-only image over the current runtime, verify live admin navigation and wallet permissions, and preserve website/configuration hashes
- [x] Commit and push the completed change
