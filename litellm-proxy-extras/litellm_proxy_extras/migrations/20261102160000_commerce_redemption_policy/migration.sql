ALTER TABLE "CommerceRedeemBatch" ADD COLUMN IF NOT EXISTS allow_repeat_redemption BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "CommerceRedeemCode_batch_id_redeemed_by_idx" ON "CommerceRedeemCode" (batch_id,redeemed_by);
