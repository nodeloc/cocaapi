CREATE TABLE IF NOT EXISTS "CommerceCustomer" (
    "user_id" TEXT PRIMARY KEY REFERENCES "LiteLLM_UserTable"("user_id") ON DELETE RESTRICT,
    "email_normalized" TEXT UNIQUE,
    "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "password_hash" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CommerceSession" (
    "token_hash" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "CommerceCustomer"("user_id") ON DELETE CASCADE,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "auth_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "CommerceSession_user_id_idx" ON "CommerceSession"("user_id");
CREATE INDEX IF NOT EXISTS "CommerceSession_expires_at_idx" ON "CommerceSession"("expires_at");

CREATE TABLE IF NOT EXISTS "CommerceActionToken" (
    "token_hash" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "CommerceCustomer"("user_id") ON DELETE CASCADE,
    "purpose" TEXT NOT NULL CHECK ("purpose" IN ('verify','reset')),
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "CommerceActionToken_user_id_purpose_idx" ON "CommerceActionToken"("user_id","purpose");
CREATE INDEX IF NOT EXISTS "CommerceActionToken_expires_at_idx" ON "CommerceActionToken"("expires_at");

CREATE TABLE IF NOT EXISTS "CommerceExternalIdentity" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "CommerceCustomer"("user_id") ON DELETE CASCADE,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("issuer","subject"),
    UNIQUE ("user_id","provider")
);

CREATE TABLE IF NOT EXISTS "CommerceOAuthFlow" (
    "state_hash" TEXT PRIMARY KEY,
    "browser_hash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "intent" TEXT NOT NULL CHECK ("intent" IN ('login','link','reauth')),
    "nonce" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "return_path" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_id" TEXT REFERENCES "CommerceCustomer"("user_id") ON DELETE CASCADE,
    "session_hash" TEXT
);

CREATE TABLE IF NOT EXISTS "CommerceMailOutbox" (
    "id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL REFERENCES "CommerceCustomer"("user_id") ON DELETE CASCADE,
    "payload" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_until" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "CommerceOAuthFlow_expires_at_idx" ON "CommerceOAuthFlow"("expires_at");
CREATE INDEX IF NOT EXISTS "CommerceMailOutbox_next_attempt_at_idx" ON "CommerceMailOutbox"("next_attempt_at");

CREATE TABLE IF NOT EXISTS "CommerceAuthRateLimit" (
    "key" TEXT NOT NULL,
    "bucket" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("key","bucket")
);
CREATE INDEX IF NOT EXISTS "CommerceAuthRateLimit_bucket_idx" ON "CommerceAuthRateLimit"("bucket");
