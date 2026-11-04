# Unified User Details Implementation Plan

**Goal:** Manage basic information, canonical user group, actual model access and wallet transactions from the same user detail page

**Architecture:** Consolidate the existing overview and details panels into one native account management panel, retaining analytics as separate tabs. Extract the existing wallet implementation into a shared inline panel used by both details and the list drawer. Read selected-user model access through the same service used by the customer gateway, never through the administrator’s model list. Preserve native user settings and team management

**Constraints:** Existing components and styling, Chinese and English, mobile layout, full admin financial operations, viewer read-only access, no fabricated customer session, no copied billing logic, registered users inherit models from their canonical group, API Key restrictions and balance checks remain enforced

- [x] Add regression tests for selected-user model access, authorization and disabled accounts, and verify failure before implementation
- [x] Add an admin reader endpoint backed by the existing gateway access calculation, regenerate OpenAPI types and run backend checks
- [x] Extract the shared wallet panel without changing mutation semantics, verify drawer tests and inline tests
- [x] Consolidate detail layout, group editing and actual model access, preserve advanced settings and team operations, pass the owner’s pending wallet requests through list and details
- [x] Prevent the native editor from writing ineffective personal-model overrides for group-managed users and verify settings save payloads
- [x] Run focused tests, lint, type checking, build and independent review, address findings
- [x] Deploy with a protected backup, test synthetic accounts through real detail UI, reconcile concurrent usage and restore test balances
- [x] Commit, push, record deployment revision and remove test resources

Validation: 150 focused UI tests and 29 backend integration tests passed, together with production type checking, targeted lint, strict Python typing, type discipline, Ruff, static build and export normalization. Independent review identified legacy model-source compatibility. Gateway access now reports its actual model-access source, and legacy configurations retain personal-model editing. Regression tests cover source selection, viewer behavior, model override omission, group-driven model refresh, retained form state and busy financial operations

Live verification: The detail page saved basic information, changed the canonical group, refreshed actual model access and preserved the unsaved basic-information draft during group assignment. Inline credit and debit used the shared wallet implementation. An adjustment committed with a deliberately lost browser response, then navigation back to the list and reopening the detail retained its original request key. The retry created no duplicate financial entry. The test account finished with zero balance and was disabled, and its raw personal models remained unchanged. Existing memberships and full group configuration matched their snapshots. Five original wallets had ordinary concurrent API settlements, each reconciled against new usage ledger entries. Both languages, mobile bounds and client navigation passed without page errors
