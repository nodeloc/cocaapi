# User Management Group Assignment

**Goal:** Show and edit canonical user groups in user management, with atomic batch assignment

**Architecture:** Add bounded membership lookup and batch assignment to the existing billing group API. Both single and batch assignment use the same transaction, optimistic membership versions and audit records. Reuse native user table selection, wallet table selection, existing group selector and dialog components

**Constraints:** Registered customer memberships only, system accounts stay separate, proxy admin write access, viewer read access, maximum 100 targets, reason required, no partial updates on conflicts, Chinese and English, existing native styling

- [x] Add failing tests for lookup authorization, atomic conflict handling and batch auditing
- [x] Implement shared single and batch assignment and generated API types
- [x] Add group columns, single edit and batch edit to users and wallets
- [x] Verify backend and UI behavior, typing, lint, build, and independent review
- [x] Deploy and verify against isolated synthetic accounts, preserve existing memberships and billing configuration
- [x] Commit and push

Validation: 54 focused UI tests and 867 backend tests passed. Five unrelated source-inspection tests require proprietary enterprise code absent from this checkout and were deselected after confirming the missing-source failures. Production type checking, static build, export normalization and targeted lint passed. Targeted Python strict typing, type discipline and Ruff checks passed

Live verification: Native users support single and batch assignment, wallets support batch assignment, both locales render correctly and tab navigation retains the document. The batch API rejected a stale version with HTTP 409 without partially applying the request. Existing memberships and the complete group configuration matched their snapshots after test-account cleanup. Changes have audit records with a shared batch ID
