# Unified User Group Policy

**Goal:** Make resource groups and billing user groups the same entity, with one ID, one model policy and one customer membership

**Architecture:** Use LiteLLM_AccessGroupTable as the authoritative user group registry. Keep model group definitions, ratios and immutable configuration history in CommerceBillingConfiguration, deriving current group names and model grants from the registry. Both native resource APIs and commerce administration share the configuration lock and revision. Account group permissions apply to discovery, key creation, native authorization and wallet reservation, while existing Key and team scopes continue to apply

**Migration:** Run an explicit, transactional migration outside proxy startup. Preserve existing IDs and rules where possible. Split differing legacy account model scopes into separate groups and copy their ratios, preserving model access and Key restrictions. Default signup uses the default group. Back up the database first and pause billed traffic during cutover

**Constraints:** No startup data rewrites, no secrets in output, no changes to existing balances or reservations, no automatic model permission expansion, Chinese and English, native styling

- [x] Add failing behavioral tests for canonical group edits, membership changes, stale versions, resource revocation and billing
- [x] Implement canonical registry reads and atomic writes shared by both APIs
- [x] Implement safe legacy migration and shared account authorization
- [x] Replace the two catalogs with one group editor including model permissions, members and ratios
- [x] Run isolated backend integration tests, focused UI tests, strict typing and lint, static build, and independent review
- [x] Back up, migrate with a maintenance cutover, verify real API permission behavior and accounting, and deploy
- [x] Commit and push
