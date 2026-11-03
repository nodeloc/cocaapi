# GoEpay payment integration plan

> **For agentic workers:** Execute inline, task by task

**Goal:** Connect real GoEpay payments to USD wallet recharge with scheduled exchange rates and idempotent crediting

**Architecture:** Reuse the existing recharge service, order locking and wallet ledger. Add an RSA V2 adapter, exact payment currency and rate snapshots, and an hourly reference-rate worker. Keep USDT available only when its actual gateway type and currency contract have been confirmed

**Tech Stack:** Python, FastAPI, cryptography, httpx, PostgreSQL, Prisma, Next.js and existing dashboard components

**Spec:** Use the user-supplied GoEpay merchant on the confirmed payment origin, support the merchant's enabled payment methods, periodically fetch exchange rates, and retain current balance checks and deduction behavior

## Constraints

Use GoEpay V2 form requests and platform RSA verification for responses and GET callbacks. Never treat browser returns or an unsigned error as payment success. Store private keys only in protected runtime files. No private keys in source, logs, images or browser data. Keep existing USDT orders readable. Snapshot the payable amount and exchange rate before creating an external order. Never reprice an existing order or guess a conversion rate

## Task 1: Protocol and rate boundary

- [x] Add real-RSA regression tests for raw form canonicalization, encoded characters, duplicate fields, stale timestamps, incorrect signatures, signed errors and malformed responses
- [x] Run tests red, then implement the GoEpay protocol and typed configuration with injected HTTP transport and clock
- [x] Add reference-rate fetch and exact Decimal quote tests, then implement cached rate persistence and hourly refresh using the documented Frankfurter USD/CNY endpoint

## Task 2: Orders and callbacks

- [x] Extend recharge orders with generic payable amount and immutable rate snapshot using schema-only migration and synchronized Prisma schemas
- [x] Add supported GoEpay payment choices, preserving existing USDT request compatibility, and store the quote before external creation
- [x] Implement verified create/query, timeout recovery by original order ID, HTTPS checkout allowlisting, and GET notifications with exact `success` only after successful reconciliation
- [x] Run isolated PostgreSQL tests covering callback tampering, mismatched amounts/merchant/order/type, duplicate and concurrent notifications, stale rates, creating-order recovery and transaction rollback

## Task 3: Dashboard and release

- [x] Reuse the current wallet form and order table for payment choice, currency, payable amount and rate display; keep current CSS and English/Chinese behavior
- [x] Regenerate OpenAPI types and run targeted UI tests, lint, production types and static build
- [x] Request read-only review and resolve findings
- [x] Back up database and protected runtime configuration, stage a current-image-based release with unchanged existing gateway/website behavior, and verify real merchant signatures and channel rejection without issuing fake payment credit; deploy disabled as the user confirmed
- [x] Deploy, verify callbacks and protected routes, remove temporary test resources, document limits, commit and push

## Deferred activation

The merchant currently has no permitted Alipay or WeChat channels. The user explicitly chose code deployment with payments closed. Real checkout, same-order replay and actual paid callback acceptance remain unverified. Keep both enabled and recovery flags false until those checks pass. USDT remains reserved and disabled
