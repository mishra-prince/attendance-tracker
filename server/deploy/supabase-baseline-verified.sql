-- Applied only after comparing all application columns, enums and named
-- constraints with a clean database built from the repository migrations.
-- Existing deployed foreign keys are DEFERRABLE INITIALLY DEFERRED; preserve
-- that existing behavior. No data reset or rerun of the initial migration.
-- Equivalent ledger baseline to prisma migrate resolve --applied after the
-- manual Bluetooth schema was completed with RefreshSession.
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
SELECT gen_random_uuid()::text,'03e98f9c4868cb68ae95afa89c52eb5c7378cef87025571f7d62da3dc5768b75',now(),'20261020120000_bluetooth_and_sessions',now(),0
WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261020120000_bluetooth_and_sessions' AND finished_at IS NOT NULL);
INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
SELECT gen_random_uuid()::text,'e45b1875b13ee34d4500de25917d1406805f697d3f63ffb8fd45f553866c319c',now(),'20261023030000_rfid_attendance',now(),1
WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261023030000_rfid_attendance' AND finished_at IS NOT NULL);
