-- CreateEnum
CREATE TYPE "EnrollmentTrustState" AS ENUM ('UNENROLLED', 'PENDING_SUPERVISED_ENROLLMENT', 'ACTIVE', 'REVOKED', 'REQUIRES_REENROLLMENT');

-- CreateEnum
CREATE TYPE "BiometricEnrollmentStatus" AS ENUM ('active', 'revoked', 'replaced');

-- CreateEnum
CREATE TYPE "EnrollmentMethod" AS ENUM ('SUPERVISED_STAFF', 'INSTITUTIONAL_ID_CARD', 'REGISTRATION_RECORD', 'TRUSTED_IDENTITY_SYSTEM', 'BIOMETRIC_ENROLLMENT_STATION');

-- CreateEnum
CREATE TYPE "AttestationResult" AS ENUM ('passed', 'failed', 'unavailable', 'error');

-- CreateEnum
CREATE TYPE "AttestationType" AS ENUM ('PLAY_INTEGRITY', 'APP_ATTEST', 'NONE');

-- CreateEnum
CREATE TYPE "AttestationPolicy" AS ENUM ('ALLOW_WITH_LOWER_ASSURANCE', 'REQUIRE_ALTERNATIVE_VERIFICATION', 'TEACHER_REVIEW');

-- CreateEnum
CREATE TYPE "AttendanceAssuranceMode" AS ENUM ('MODE_A', 'MODE_B', 'MODE_C');

-- AlterEnum
ALTER TYPE "AttendanceMethod" ADD VALUE 'BLE_AUTO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'BLE_FINALIZE';
ALTER TYPE "AuditAction" ADD VALUE 'BIOMETRIC_ENROLLMENT';
ALTER TYPE "AuditAction" ADD VALUE 'BIOMETRIC_REVOCATION';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "enrollment_trust_state" "EnrollmentTrustState" NOT NULL DEFAULT 'UNENROLLED';

-- Restore join-code columns used by the application but absent from the initial migration.
ALTER TABLE "Section" ADD COLUMN "join_code" TEXT,
    ADD COLUMN "join_code_expires_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "Section_join_code_key" ON "Section"("join_code");

-- CreateTable
CREATE TABLE "RefreshSession" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "BleSession" (
    "session_id" TEXT NOT NULL,
    "timetable_id" TEXT,
    "class_session_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "beacon_nonce" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "required_minutes" INTEGER NOT NULL DEFAULT 30,
    "finalized_at" TIMESTAMP(3),
    "anchor_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BleSession_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "BlePing" (
    "ping_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "rssi" INTEGER NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchor_ok" BOOLEAN,

    CONSTRAINT "BlePing_pkey" PRIMARY KEY ("ping_id")
);

-- CreateTable
CREATE TABLE "AnchorSighting" (
    "id" TEXT NOT NULL,
    "anchor_id" TEXT NOT NULL,
    "room_no" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "rssi" INTEGER NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnchorSighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricEnrollment" (
    "enrollment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_method" "EnrollmentMethod" NOT NULL,
    "enrolled_by" TEXT NOT NULL,
    "device_id" TEXT,
    "biometric_version" INTEGER NOT NULL DEFAULT 1,
    "status" "BiometricEnrollmentStatus" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricEnrollment_pkey" PRIMARY KEY ("enrollment_id")
);

-- CreateTable
CREATE TABLE "DeviceIntegrityEvent" (
    "event_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "attestation_type" "AttestationType" NOT NULL,
    "result" "AttestationResult" NOT NULL,
    "reason_code" TEXT,
    "session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceIntegrityEvent_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_token_hash_key" ON "RefreshSession"("token_hash");

-- CreateIndex
CREATE INDEX "RefreshSession_user_id_expires_at_idx" ON "RefreshSession"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "BleSession_class_session_id_key" ON "BleSession"("class_session_id");

-- CreateIndex
CREATE INDEX "BleSession_section_id_date_idx" ON "BleSession"("section_id", "date");

-- CreateIndex
CREATE INDEX "BlePing_session_id_student_id_idx" ON "BlePing"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "BlePing_session_id_student_id_seen_at_key" ON "BlePing"("session_id", "student_id", "seen_at");

-- CreateIndex
CREATE INDEX "AnchorSighting_student_id_seen_at_idx" ON "AnchorSighting"("student_id", "seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricEnrollment_student_id_key" ON "BiometricEnrollment"("student_id");

-- CreateIndex
CREATE INDEX "BiometricEnrollment_status_idx" ON "BiometricEnrollment"("status");

-- CreateIndex
CREATE INDEX "DeviceIntegrityEvent_student_id_created_at_idx" ON "DeviceIntegrityEvent"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "DeviceIntegrityEvent_device_id_created_at_idx" ON "DeviceIntegrityEvent"("device_id", "created_at");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlePing" ADD CONSTRAINT "BlePing_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "BleSession"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlePing" ADD CONSTRAINT "BlePing_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnchorSighting" ADD CONSTRAINT "AnchorSighting_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricEnrollment" ADD CONSTRAINT "BiometricEnrollment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricEnrollment" ADD CONSTRAINT "BiometricEnrollment_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIntegrityEvent" ADD CONSTRAINT "DeviceIntegrityEvent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;
