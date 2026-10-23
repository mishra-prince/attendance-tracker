-- This application uses its own User/JWT/Prisma API, not Supabase Auth or
-- direct browser database access. Keep the server on the postgres table owner
-- connection (or a deliberately provisioned backend role). NO FORCE RLS.
-- Supabase client roles receive no policies or table privileges.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','RefreshSession','Department','AcademicYear','Semester','Course','Section','Subject','SubjectTeacher','Student','Teacher','Enrollment','Timetable','ClassSession','Attendance','AttendanceCorrection','AttendanceQRSession','Leave','Notification','AuditLog','Settings','BleSession','BlePing','AnchorSighting','BiometricEnrollment','DeviceIntegrityEvent','RfidReader','RfidCard','RfidEvent','RfidVisit','_prisma_migrations']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC',t);
  END LOOP;
END $$;
