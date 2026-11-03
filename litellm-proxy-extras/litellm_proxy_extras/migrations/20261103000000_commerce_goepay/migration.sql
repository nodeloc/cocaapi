ALTER TABLE "CommerceRechargeOrder" ADD COLUMN IF NOT EXISTS payment_amount TEXT;
ALTER TABLE "CommerceRechargeOrder" ADD COLUMN IF NOT EXISTS quote_snapshot JSONB;
ALTER TABLE "CommerceRechargeOrder" DROP CONSTRAINT IF EXISTS "CommerceRechargeOrder_network_check";
ALTER TABLE "CommerceRechargeOrder" ADD CONSTRAINT "CommerceRechargeOrder_network_check"
    CHECK (network IN ('tron','ethereum','bsc','alipay','wxpay'));
CREATE TABLE IF NOT EXISTS "CommerceExchangeRate" (
    pair TEXT PRIMARY KEY,
    rate TEXT NOT NULL,
    rate_date DATE NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL
);
