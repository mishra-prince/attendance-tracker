-- AlterTable
ALTER TABLE "BiometricEnrollment" ADD COLUMN     "consent_recorded_at" TIMESTAMP(3),
ADD COLUMN     "face_captured_at" TIMESTAMP(3),
ADD COLUMN     "face_ciphertext" TEXT,
ADD COLUMN     "face_model" TEXT;

-- CreateTable
CREATE TABLE "FaceChallenge" (
    "challenge_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_session_id" TEXT NOT NULL,
    "class_session_id" TEXT,
    "purpose" TEXT NOT NULL,
    "phase" TEXT,
    "enrollment_version" INTEGER NOT NULL,
    "actions" JSONB NOT NULL,
    "policy" JSONB NOT NULL,
    "enrollment_method" "EnrollmentMethod",
    "state" TEXT NOT NULL DEFAULT 'pending',
    "evidence_hash" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "FaceChallenge_pkey" PRIMARY KEY ("challenge_id")
);

-- CreateTable
CREATE TABLE "FaceRequirement" (
    "requirement_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "spot_due_at" TIMESTAMP(3) NOT NULL,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "join_passed_at" TIMESTAMP(3),
    "spot_passed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceRequirement_pkey" PRIMARY KEY ("requirement_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FaceChallenge_evidence_hash_key" ON "FaceChallenge"("evidence_hash");

-- CreateIndex
CREATE INDEX "FaceChallenge_student_id_created_at_idx" ON "FaceChallenge"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "FaceChallenge_class_session_id_state_idx" ON "FaceChallenge"("class_session_id", "state");

-- CreateIndex
CREATE INDEX "FaceRequirement_session_id_idx" ON "FaceRequirement"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "FaceRequirement_student_id_session_id_key" ON "FaceRequirement"("student_id", "session_id");

-- AddForeignKey
ALTER TABLE "FaceChallenge" ADD CONSTRAINT "FaceChallenge_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceChallenge" ADD CONSTRAINT "FaceChallenge_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceChallenge" ADD CONSTRAINT "FaceChallenge_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "ClassSession"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceRequirement" ADD CONSTRAINT "FaceRequirement_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceRequirement" ADD CONSTRAINT "FaceRequirement_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ClassSession"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Supabase browser roles must never access identity templates or challenge state.
ALTER TABLE "FaceChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FaceRequirement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FaceChallenge", "FaceRequirement" FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON "FaceChallenge", "FaceRequirement" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
