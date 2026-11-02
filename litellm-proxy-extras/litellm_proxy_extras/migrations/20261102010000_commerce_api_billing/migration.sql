ALTER TABLE "CommerceWallet" ADD COLUMN IF NOT EXISTS debt_units BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "CommerceWallet" DROP CONSTRAINT IF EXISTS "CommerceWallet_check";
ALTER TABLE "CommerceWallet" DROP CONSTRAINT IF EXISTS "CommerceWallet_balance_check";
ALTER TABLE "CommerceWallet" ADD CONSTRAINT "CommerceWallet_balance_check" CHECK
    (available_units::numeric+reserved_units::numeric-debt_units::numeric=credited_units::numeric-debited_units::numeric);
ALTER TABLE "CommerceWallet" DROP CONSTRAINT IF EXISTS "CommerceWallet_debt_units_check";
ALTER TABLE "CommerceWallet" ADD CONSTRAINT "CommerceWallet_debt_units_check" CHECK (debt_units>=0);
ALTER TABLE "CommerceLedger" DROP CONSTRAINT IF EXISTS "CommerceLedger_delta_units_check";
ALTER TABLE "CommerceLedger" ADD CONSTRAINT "CommerceLedger_delta_units_check" CHECK (kind='usage' OR delta_units<>0);
ALTER TABLE "CommerceLedger" DROP CONSTRAINT IF EXISTS "CommerceLedger_available_after_check";
ALTER TABLE "CommerceLedger" ADD CONSTRAINT "CommerceLedger_available_after_check" CHECK (available_after>=0);
ALTER TABLE "CommerceLedger" DROP CONSTRAINT IF EXISTS "CommerceLedger_kind_check";
ALTER TABLE "CommerceLedger" ADD CONSTRAINT "CommerceLedger_kind_check" CHECK (kind IN ('adjustment','redemption','recharge','usage'));
CREATE TABLE IF NOT EXISTS "CommerceCallReservation" (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "CommerceWallet"(user_id) ON DELETE RESTRICT,
    model TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    native_request_id TEXT NOT NULL DEFAULT '',
    reserved_units BIGINT NOT NULL CHECK (reserved_units>0),
    actual_units BIGINT CHECK (actual_units>=0),
    dispatched_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','released','review')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((status IN ('settled','released'))=(actual_units IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "CommerceCallReservation_user_id_created_at_idx" ON "CommerceCallReservation"(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS "CommerceCallReservation_status_created_at_idx" ON "CommerceCallReservation"(status,created_at);
ALTER TABLE "CommerceCallReservation" ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
