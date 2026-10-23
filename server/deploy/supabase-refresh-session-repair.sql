-- Project osdousdloxpcxdpszqtc already has the Bluetooth/biometric schema,
-- but its manually installed version omitted RefreshSession. Add only this
-- missing table. Do not rerun the full Bluetooth migration over existing data.
CREATE TABLE "public"."RefreshSession" (
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("session_id"),
  CONSTRAINT "RefreshSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefreshSession_token_hash_key" ON "public"."RefreshSession"("token_hash");
CREATE INDEX "RefreshSession_user_id_expires_at_idx" ON "public"."RefreshSession"("user_id","expires_at");
