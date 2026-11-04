# Unified User Management Implementation Plan

**Goal:** Manage identity, group, permissions and balance from one native user table

**Architecture:** Keep the native user list as the only source of rows, filters, sorting, pagination and selection. Fetch financial summaries for those exact IDs through one bounded, admin-only lookup. Reuse existing audited, idempotent wallet adjustments and ledger APIs in a native side panel. Remove the separate wallet table and preserve legacy navigation

**Tech Stack:** FastAPI, Prisma/PostgreSQL, React Query, nuqs, shared DataTable and Sheet, existing Chinese and English dictionaries

**Design:** Combine email and ID in the primary identity cell. Show group, role, status, available balance, spend, key count and creation date by default. Keep less-used columns available in the existing visibility menu. Balance opens a side panel with account identity, current totals, ledger pagination and an explicit adjustment form. Financial reads and writes remain restricted to full proxy admins. System accounts never acquire a wallet from a directory read. Failed financial reads display unavailable instead of zero

- [x] Extend `test_wallet_authorization.py` with bounded lookup, exact ID matching, uncreated-wallet zero summaries, read-only behavior and authorization assertions, then verify failure
- [x] Add `WalletLookup` and `lookup_wallets` to the existing wallet model, repository and admin routes, regenerate dashboard API types and run backend checks
- [x] Update `view_users.test.tsx` to assert one table, legacy wallet navigation, merged balances, one shared selection and retained search after the balance panel closes
- [x] Add a native wallet side panel with network-boundary tests for correct account, adjustment payload, retry idempotency, query refresh and persistent success after read failure
- [x] Integrate wallet context into native columns and row actions, use compact identity and sensible default column visibility, remove the independent wallet implementation from `CommerceAdmin`, update legacy links and translations
- [x] Run focused UI tests, type checking, lint, build and export normalization, request independent code review and address findings
- [x] Deploy with a verified runtime overlay and protected backup, test real UI adjustments using isolated accounts, verify unchanged existing balances, memberships, configuration and website assets
- [x] Commit and push, update deployment revision and remove isolated test resources

Validation: 56 focused UI tests, 26 backend integration tests, production type checking, targeted lint, strict Python typing, type discipline, Ruff, static build and export normalization passed. Independent review found an unresolved-adjustment retry risk across drawer unmounts. An owner-scoped store now restores each user’s pending operation and retains its original idempotency key, with a failing-then-passing regression

Live verification: One native directory, legacy wallet bookmark, shared selection, retained search and selection, actual credit and debit, actual committed-but-lost response followed by drawer close/reopen and idempotent retry, ledger visibility, both locales, page navigation, mobile bounds and zero page errors. Only three financial ledger entries were created for the test account despite the lost-response retry. Its balance was restored to zero and both test accounts were disabled. Existing memberships and complete group configuration matched their snapshots. Three existing wallets had concurrent API settlements, reconciled exactly against their new usage ledger entries, with no other changes to existing wallets
