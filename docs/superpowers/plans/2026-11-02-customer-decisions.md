# Customer Decisions Implementation Plan

**Goal:** Make the configured decision model available through customer API keys with wallet billing

**Architecture:** Keep the native Decisions endpoint, routing, validation and cost calculator. Extend the existing wallet admission and quote paths for text decisions, then settle reported usage through the existing ledger and group multipliers

**Tech Stack:** Python, LiteLLM, PostgreSQL, Docker

**Scope:** The requested model uses the OpenAI Decisions protocol. Customer calls use `/v1/decisions` with text input and typed questions. Existing chat, budgets, key restrictions and group pricing remain enforced

## Implementation

- [x] Extend `tests/unit/proxy/commerce/test_billing_pricing.py` to prove decisions preserve their body without chat output limits, retain questions at deployment admission, reject unsupported media and include question text in the quote
- [x] Extend `tests/integration/commerce/test_api_billing.py` and `billing_upstream.py` to prove zero balance blocks dispatch, success charges configured usage exactly once, upstream failure releases the hold, and questions cannot bypass reservation
- [x] Run the new tests against the old wallet modules and observe failures
- [x] Update `litellm/proxy/commerce/billing_hook.py` and `billing_pricing.py`, then run pricing and HTTP billing regressions in an isolated database
- [x] Build an incremental image from the current runtime, back up production configuration and database, and verify the candidate before replacing the gateway
- [x] Add the model to registration defaults and existing enabled customer grants through native management APIs, preserving explicit key and group restrictions
- [x] Verify a temporary customer's real decision request and ledger, remove temporary access and document evidence in `deploy/cocaapi/UPSTREAMS.md`
