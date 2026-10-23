-- AlterEnum
ALTER TYPE "AttendanceMethod" ADD VALUE 'RFID';

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "room_no" TEXT;

-- CreateTable
CREATE TABLE "RfidReader" (
    "reader_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_no" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "capture_id" TEXT,
    "capture_until" TIMESTAMP(3),
    "capture_hash" TEXT,
    "capture_suffix" TEXT,
    "captured_at" TIMESTAMP(3),

    CONSTRAINT "RfidReader_pkey" PRIMARY KEY ("reader_id")
);

-- CreateTable
CREATE TABLE "RfidCard" (
    "card_id" TEXT NOT NULL,
    "uid_hash" TEXT NOT NULL,
    "uid_suffix" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "RfidCard_pkey" PRIMARY KEY ("card_id")
);

-- CreateTable
CREATE TABLE "RfidEvent" (
    "event_id" TEXT NOT NULL,
    "reader_id" TEXT NOT NULL,
    "uid_hash" TEXT NOT NULL,
    "uid_suffix" TEXT NOT NULL,
    "student_id" TEXT,
    "session_id" TEXT,
    "direction" TEXT,
    "outcome" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfidEvent_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "RfidVisit" (
    "visit_id" TEXT NOT NULL,
    "reader_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "entry_event_id" TEXT NOT NULL,
    "exit_event_id" TEXT,
    "entry_at" TIMESTAMP(3) NOT NULL,
    "exit_at" TIMESTAMP(3),

    CONSTRAINT "RfidVisit_pkey" PRIMARY KEY ("visit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RfidReader_room_no_key" ON "RfidReader"("room_no");

-- CreateIndex
CREATE UNIQUE INDEX "RfidReader_capture_id_key" ON "RfidReader"("capture_id");

-- CreateIndex
CREATE UNIQUE INDEX "RfidCard_uid_hash_key" ON "RfidCard"("uid_hash");

-- CreateIndex
CREATE INDEX "RfidCard_student_id_is_active_idx" ON "RfidCard"("student_id", "is_active");

-- CreateIndex
CREATE INDEX "RfidEvent_student_id_received_at_idx" ON "RfidEvent"("student_id", "received_at");

-- CreateIndex
CREATE INDEX "RfidEvent_reader_id_received_at_idx" ON "RfidEvent"("reader_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "RfidVisit_entry_event_id_key" ON "RfidVisit"("entry_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "RfidVisit_exit_event_id_key" ON "RfidVisit"("exit_event_id");

-- CreateIndex
CREATE INDEX "RfidVisit_session_id_student_id_idx" ON "RfidVisit"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "RfidVisit_student_id_exit_at_idx" ON "RfidVisit"("student_id", "exit_at");

-- AddForeignKey
ALTER TABLE "RfidReader" ADD CONSTRAINT "RfidReader_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidCard" ADD CONSTRAINT "RfidCard_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidCard" ADD CONSTRAINT "RfidCard_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidEvent" ADD CONSTRAINT "RfidEvent_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "RfidReader"("reader_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidEvent" ADD CONSTRAINT "RfidEvent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidEvent" ADD CONSTRAINT "RfidEvent_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassSession"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidVisit" ADD CONSTRAINT "RfidVisit_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "RfidReader"("reader_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidVisit" ADD CONSTRAINT "RfidVisit_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfidVisit" ADD CONSTRAINT "RfidVisit_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassSession"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Protect one active card per student and one unfinished interval per class.
CREATE UNIQUE INDEX "RfidCard_one_active_per_student" ON "RfidCard"("student_id") WHERE "is_active" = true;
CREATE UNIQUE INDEX "RfidVisit_one_open_per_class" ON "RfidVisit"("session_id", "student_id") WHERE "exit_at" IS NULL;
ALTER TABLE "RfidVisit" ADD CONSTRAINT "RfidVisit_valid_interval" CHECK ("exit_at" IS NULL OR "exit_at" >= "entry_at");
ALTER TABLE "RfidEvent" ADD CONSTRAINT "RfidEvent_valid_direction" CHECK ("direction" IS NULL OR "direction" IN ('IN', 'OUT'));

UPDATE "ClassSession" AS c SET "room_no" = t."room_no" FROM "Timetable" AS t WHERE c."timetable_id" = t."timetable_id" AND c."room_no" IS NULL;
-- Fill missing section subject enrollment only; explicit dropped/completed decisions are preserved.
INSERT INTO "Enrollment" ("enrollment_id", "student_id", "subject_id", "semester_id", "section_id", "status", "enrolled_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, s."student_id", sub."subject_id", sec."semester_id", sec."section_id", 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Student" s JOIN "User" u ON u."user_id" = s."user_id" AND u."is_active" = true
JOIN "Section" sec ON sec."section_id" = s."section_id" AND sec."course_id" = s."course_id"
JOIN "Subject" sub ON sub."course_id" = sec."course_id" AND sub."semester_id" = sec."semester_id"
ON CONFLICT ("student_id", "subject_id", "semester_id", "section_id") DO NOTHING;
