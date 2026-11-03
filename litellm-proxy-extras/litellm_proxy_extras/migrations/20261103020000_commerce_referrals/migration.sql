CREATE TABLE IF NOT EXISTS "CommerceReferralConfiguration" (
    id TEXT PRIMARY KEY CHECK (id='referrals'),
    revision INTEGER NOT NULL CHECK (revision>0),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    inviter_units BIGINT NOT NULL CHECK (inviter_units>=0),
    invitee_units BIGINT NOT NULL CHECK (invitee_units>=0),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (NOT enabled OR (inviter_units>0 AND invitee_units>0))
);
CREATE TABLE IF NOT EXISTS "CommerceReferralCode" (
    user_id TEXT PRIMARY KEY REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9_-]{16,64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "CommerceReferral" (
    invitee_id TEXT PRIMARY KEY REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    inviter_id TEXT NOT NULL REFERENCES "CommerceCustomer"(user_id) ON DELETE RESTRICT,
    inviter_units BIGINT NOT NULL CHECK (inviter_units>=0),
    invitee_units BIGINT NOT NULL CHECK (invitee_units>=0),
    state TEXT NOT NULL CHECK (state IN ('pending','granted','inactive','ineligible')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rewarded_at TIMESTAMPTZ,
    failure_code TEXT,
    CHECK (invitee_id<>inviter_id),
    CHECK ((state='granted')=(rewarded_at IS NOT NULL)),
    CHECK (state='inactive' OR (inviter_units>0 AND invitee_units>0))
);
CREATE INDEX IF NOT EXISTS "CommerceReferral_inviter_id_created_at_idx" ON "CommerceReferral"(inviter_id,created_at DESC);
CREATE TABLE IF NOT EXISTS "CommerceReferralOAuthFlow" (
    state_hash TEXT PRIMARY KEY REFERENCES "CommerceOAuthFlow"(state_hash) ON DELETE CASCADE,
    referral_code TEXT NOT NULL CHECK (referral_code ~ '^[A-Za-z0-9_-]{16,64}$')
);
ALTER TABLE "CommerceLedger" DROP CONSTRAINT IF EXISTS "CommerceLedger_kind_check";
ALTER TABLE "CommerceLedger" ADD CONSTRAINT "CommerceLedger_kind_check"
CHECK (kind IN ('adjustment','redemption','recharge','usage','referral')) NOT VALID;
