# BACKEND.md — Backend Architecture (v2 — audited)

## Stack
Node.js + Express + TypeScript + Prisma ORM + PostgreSQL + JWT + bcrypt/argon2 + Multer + Nodemailer + node-cron.

## Folder structure
```
/server
  /src
    /controllers    → auth, user, department, course, section, subject, enrollment,
                       timetable, session, attendance, correction, leave, notification,
                       report, analytics, settings, audit
    /routes         → one file per controller above
    /middleware     → auth.middleware.ts (verify JWT), rbac.middleware.ts (role + resource-scope check),
                       error.middleware.ts, validate.middleware.ts, rateLimit.middleware.ts
    /services       → attendance.service.ts (calculation — single source of truth)
                       session.service.ts (open/submit/lock lifecycle)
                       correction.service.ts
                       qr.service.ts
                       proxy-detection.service.ts
                       notification.service.ts
                       report.service.ts
                       settings.service.ts (reads configurable thresholds/rules)
                       audit.service.ts
    /prisma         → schema.prisma, seed.ts, /migrations
    /jobs           → lowAttendanceAlert.job.ts, sessionAutoLock.job.ts
    /utils          → hash.ts, jwt.ts, dateHelpers.ts
    app.ts
    server.ts
```

## Auth flow (central User model)
1. `User` is the single auth table — `Student` and `Teacher` link to it via `user_id`, no duplicated credentials
2. Signup: hash with bcrypt/argon2, never plaintext; role assigned at creation (`SUPER_ADMIN`/`ADMIN`/`HOD`/`TEACHER`/`STUDENT`)
3. Login: verify password, issue short-lived access JWT (~15 min) + httpOnly refresh cookie (~7 days)
4. `auth.middleware.ts` verifies the access token, attaches `req.user = { id, role, teacherId?, studentId? }`
5. `rbac.middleware.ts` checks role **and** resource scope — e.g., a `TEACHER` hitting `/sessions/:id/attendance` must additionally be the assigned teacher for that session, not just "any teacher"
6. Refresh endpoint rotates the access token; logout revokes the refresh cookie
7. **Never trust `role` or any ownership claim from the client** — re-derive from the JWT + DB on every request

## RBAC matrix
| Action | Student | Teacher | HOD | Admin | Super Admin |
|---|---|---|---|---|---|
| View own attendance | ✓ | — | — | — | — |
| Mark session attendance | ✗ | ✓ (own sessions) | ✓ (dept sessions) | ✓ | ✓ |
| Generate/scan QR | scan only | generate (own) | — | — | — |
| Request correction | ✓ | ✓ | — | — | — |
| Approve/reject correction | ✗ | ✗ | ✓ (dept) | ✓ | ✓ |
| Approve/reject leave | ✗ | ✓ (own students) | ✓ (dept) | ✓ | ✓ |
| Manage timetable | ✗ | ✗ | ✓ (dept) | ✓ | ✓ |
| Manage departments/settings | ✗ | ✗ | ✗ | ✓ | ✓ |
| View audit log | ✗ | ✗ | ✓ (dept) | ✓ | ✓ |

## Attendance calculation service — single source of truth
`attendance.service.ts` is the **only** place percentage math happens. Frontend never recomputes it.

```
eligible_sessions = ClassSessions for (student, subject) where
                       status != 'cancelled'
                       AND student had active Enrollment on that date
counted_present    = eligible_sessions where status IN configured_present_set
percentage         = counted_present / eligible_sessions * 100   (guard divide-by-zero → null, not 0)
```
`configured_present_set` and exclusion rules are read from `Settings` at request time:
- `present` → always counts
- `late` → counts by default, configurable
- `on_duty` → counts by default, configurable
- `absent` → never counts
- `medical` / `excused` → excluded from denominator by default, configurable
- `cancelled` session → excluded entirely from denominator

Condonation calculator (`classes_can_still_miss`, `classes_needed_to_reach_threshold`) is a **separate** function built on top of this, not duplicated logic.

## Session lifecycle & attendance locking
```
scheduled → open → submitted → locked
```
- `scheduled`: session exists on the timetable, not yet started
- `open`: teacher can freely mark/edit attendance
- `submitted`: teacher has finished marking; edits allowed for a configurable grace window (`Settings.submission_edit_window_minutes`)
- `locked`: no direct edits — any change must go through `AttendanceCorrection`
- Admin/HOD can override locking when explicitly authorized (logged to `AuditLog` with action `LOCK`/`UPDATE`)
- `jobs/sessionAutoLock.job.ts` locks sessions past the grace window on a schedule

## Attendance correction workflow
1. Student or teacher submits a correction request (`old_status` → `requested_status`, reason, optional document)
2. Status `pending` until an HOD/Admin reviews it
3. On approval: `correction.service.ts` updates the `Attendance` row, writes `AuditLog` (action `APPROVE`), and triggers a `Notification`
4. On rejection: status set, `rejection_reason` stored, `Notification` sent — no data change

## QR attendance security
`qr.service.ts` responsibilities:
- Generate: create `AttendanceQRSession` row with a signed opaque token (JWT or HMAC), `expires_at` ~5 min out; QR image encodes **only the token**, never session/student data
- Scan verification checklist (all required, in order):
  1. Token signature valid
  2. Token not expired
  3. `AttendanceQRSession.revoked_at` is null
  4. Referenced `ClassSession.status == 'open'`
  5. Scanning student belongs to the session's section
  6. Scanning student has an active `Enrollment` in the subject
  7. No existing `Attendance` row for (session_id, student_id) — enforced by the unique constraint too, as defense in depth
  8. Request is rate-limited per student/IP
- Any failure → generic 4xx error; do not leak which check failed (avoids helping someone probe the system)

## Proxy / buddy-punching detection
Flag, don't auto-punish, on first implementation. Signals combined (not IP alone — shared campus Wi-Fi makes IP unreliable):
- `device_id` reuse across different students in a short window
- Multiple scan attempts from the same authenticated session in quick succession
- Geofence mismatch, if enabled
- Unusual request velocity
`proxy-detection.service.ts` writes a flag to `AuditLog`/a review queue for HOD/Admin rather than silently blocking the student — avoids false-positive lockouts.

## Notification service
- Channels: `in_app`, `email`, `sms` (Twilio, optional)
- Triggers: low attendance (via nightly `lowAttendanceAlert.job.ts`), leave approved/rejected, correction approved/rejected, admin announcements
- Every send attempt recorded with `status` (`pending`/`sent`/`failed`) and `error_message` on failure — never fail silently

## Settings service
Centralizes configurable rules so nothing is hardcoded:
- `minimum_attendance_percentage` (default 75)
- which statuses count as present
- submission edit window duration
- whether low attendance auto-blocks exam eligibility (**off by default** — admin must explicitly enable)

## Audit logging
`audit.service.ts` wraps every mutation on: attendance, corrections, leave approvals, timetable, settings, user role changes. Captures `old_value`/`new_value` as JSON, `ip_address`, `user_agent`, `request_id`. The audit table has no update/delete route for any role.

## Error handling & validation
Same as v1: centralized `error.middleware.ts`, consistent `{ success, data?, error? }` shape, Zod schemas per route in `validate.middleware.ts`, proper status codes (400/401/403/404/409/500).

## Security checklist (unchanged, reinforced)
- bcrypt/argon2 hashing, JWT + refresh rotation, httpOnly cookies
- Rate limiting on auth, QR scan, and correction-submission endpoints
- CORS restricted to frontend origin, Helmet headers
- File upload validation (MIME + extension + size, sanitized filenames), S3-compatible storage in production
- Parameterized queries via Prisma (no raw string SQL), CSRF protection where cookies are used
- No secrets in git; document every env var in README
