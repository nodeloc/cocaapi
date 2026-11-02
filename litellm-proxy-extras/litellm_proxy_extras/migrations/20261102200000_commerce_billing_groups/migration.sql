CREATE TABLE IF NOT EXISTS "CommerceBillingConfiguration" (
    revision INTEGER PRIMARY KEY CHECK (revision > 0),
    payload TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "CommerceBillingConfiguration" (revision,payload,updated_by)
VALUES (1,'{"user_groups":[{"id":"default","name":"普通组"}],"model_groups":[{"id":"default","name":"普通模型组","models":[]}],"rules":[]}','migration')
ON CONFLICT (revision) DO NOTHING;
ALTER TABLE "CommerceCustomer" ADD COLUMN IF NOT EXISTS billing_group_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "CommerceCustomer" ADD COLUMN IF NOT EXISTS billing_group_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "CommerceCustomer_billing_group_id_created_at_idx" ON "CommerceCustomer" (billing_group_id,created_at DESC);
ALTER TABLE "CommerceCallReservation" ADD COLUMN IF NOT EXISTS base_reserved_units BIGINT;
ALTER TABLE "CommerceCallReservation" ADD COLUMN IF NOT EXISTS base_actual_units BIGINT;
ALTER TABLE "CommerceCallReservation" ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
ALTER TABLE "CommerceCallReservation" ADD COLUMN IF NOT EXISTS spend_log_token TEXT;
ALTER TABLE "CommerceAuditEvent" ADD COLUMN IF NOT EXISTS details JSONB;
