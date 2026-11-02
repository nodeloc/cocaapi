# Customer navigation implementation plan

> **For agentic workers:** Execute this plan inline, task by task

**Goal:** Switch customer menus without reloading the document or reloading the account session on every page

**Architecture:** Use Next Link and a persistent account layout provider for the customer identity, transport and React Query cache. Public authentication routes remain outside the private session provider. Clear private state on logout, expiry, identity change and leaving the customer area

**Tech Stack:** Next.js static export, React, TanStack Query, Vitest and Playwright

**Spec:** The user reports loading on every customer menu switch while the native administrator UI stays mounted. Preserve the existing UI, authorization and wallet behavior

## Global constraints

Keep the current layout, styling and URLs. Keep credentials in memory and HttpOnly cookies. Continue reading current wallet data and enforcing all server-side balance and permission checks

## Task 1: Preserve the customer session during navigation

- [x] Add `AccountSession.integration.test.tsx`, rendering the real account layout and native page, then replacing the page child. Assert one profile request and preserved cached page data
- [x] Run `npx vitest run src/components/account/AccountSession.integration.test.tsx` and confirm the regression fails before implementation
- [x] Add `AccountSessionLayout.tsx`, `native/CustomerSessionContext.ts` and `native/CustomerSessionProvider.tsx`. The layout selects private routes; the provider owns identity, transport, origin binding and QueryClient. Revalidate on focus, clear cache on identity changes and expiry, and clean up on unmount
- [x] Simplify `CustomerNativePage.tsx` to consume the shared session, with a standalone provider fallback for isolated rendering
- [x] Change internal menu, logo, breadcrumb and profile-card navigation to Next Link in `AccountDashboardShell.tsx` and `AccountProfile.tsx`. Reuse the session in `AccountProfile.tsx` and `AccountWallet.tsx`, retaining live wallet reads and CSRF writes
- [x] Run session, dashboard, gateway, wallet and authentication integration tests, targeted lint and TypeScript checks. Verify identity change, expiry, logout and public-route cleanup

## Task 2: Verify the static export and release

- [x] Build and normalize the static export. Build a UI-only image from the current immutable production image and retain a protected rollback snapshot
- [x] Run a preview with unchanged runtime configuration. In a live isolated browser, switch customer menus and verify zero document navigations, no repeated profile calls, preserved navigation state and working private/public routes
- [x] Release the image, verify administrator navigation and root website behavior, disable the zero-credit temporary QA customer and remove its sessions
- [x] Record verification, commit the owned files with `fix: preserve customer sessions during menu navigation`, push and record the deployment revision
