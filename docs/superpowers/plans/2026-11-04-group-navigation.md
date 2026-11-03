# Group Management and Client Navigation

**Goal:** Use client routing for commerce tabs and combine billing groups and resource permissions under User Groups

**Architecture:** Replace commerce anchors with Next Link. Mount the existing billing and access group screens as separate tabs at the existing access-groups route, keeping authorization and data contracts intact. Redirect the old billing groups route to the new billing tab

**Constraints:** Preserve accounting, account and Key permissions, configuration revision checks, existing forms, Chinese and English, and native styling

- [x] Add regression tests for group tabs, role restrictions, and old links
- [x] Reproduce full document navigation against the current deployment and retain a browser regression test
- [x] Implement client links and the shared User Groups entry
- [x] Run focused tests, typecheck, lint and build, and request a read-only review
- [x] Deploy the UI over the current runtime and verify document continuity, group forms, redirects, configuration and website preservation
- [x] Commit and push
