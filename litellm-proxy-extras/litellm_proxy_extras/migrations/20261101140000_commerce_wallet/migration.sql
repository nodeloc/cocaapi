CREATE TABLE IF NOT EXISTS "CommerceWallet" (
    user_id TEXT PRIMARY KEY REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    available_units BIGINT NOT NULL DEFAULT 0 CHECK (available_units>=0),
    reserved_units BIGINT NOT NULL DEFAULT 0 CHECK (reserved_units>=0),
    credited_units BIGINT NOT NULL DEFAULT 0 CHECK (credited_units>=0),
    debited_units BIGINT NOT NULL DEFAULT 0 CHECK (debited_units>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (available_units::numeric+reserved_units::numeric=credited_units::numeric-debited_units::numeric)
);
CREATE TABLE IF NOT EXISTS "CommerceLedger" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "CommerceWallet"(user_id) ON DELETE RESTRICT,
    delta_units BIGINT NOT NULL CHECK (delta_units<>0),
    available_after BIGINT NOT NULL CHECK (available_after>=0),
    kind TEXT NOT NULL CHECK (kind IN ('adjustment','redemption','recharge')),
    business_key TEXT NOT NULL UNIQUE,
    reference TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CommerceLedger_user_id_created_at_id_idx" ON "CommerceLedger"(user_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS "CommerceAuditEvent" (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CommerceAuditEvent_target_id_created_at_idx" ON "CommerceAuditEvent"(target_id,created_at);
CREATE TABLE IF NOT EXISTS "CommerceRedeemBatch" (
    id TEXT PRIMARY KEY,
    request_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    face_units BIGINT NOT NULL CHECK (face_units>0),
    count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 100),
    disabled BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "CommerceRedeemCode" (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES "CommerceRedeemBatch"(id) ON DELETE RESTRICT,
    code_hash TEXT NOT NULL UNIQUE,
    tail TEXT NOT NULL,
    redeemed_by TEXT REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    redeemed_at TIMESTAMPTZ,
    CHECK ((redeemed_by IS NULL)=(redeemed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS "CommerceRedeemCode_batch_id_idx" ON "CommerceRedeemCode"(batch_id);
CREATE TABLE IF NOT EXISTS "CommerceRechargeOrder" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    credit_units BIGINT NOT NULL CHECK (credit_units>0),
    network TEXT NOT NULL CHECK (network IN ('tron','ethereum','bsc')),
    asset TEXT NOT NULL DEFAULT 'USDT',
    provider TEXT NOT NULL,
    merchant_account_id TEXT NOT NULL,
    request_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','pending','paid','expired','review')),
    amount_usdt TEXT,
    checkout_url TEXT,
    external_id TEXT,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider,external_id)
);
CREATE INDEX IF NOT EXISTS "CommerceRechargeOrder_user_id_created_at_id_idx" ON "CommerceRechargeOrder"(user_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS "CommercePaymentEvent" (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    order_id TEXT NOT NULL REFERENCES "CommerceRechargeOrder"(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider,event_id)
);
