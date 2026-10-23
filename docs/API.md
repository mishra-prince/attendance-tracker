# API.md — REST Endpoint Reference (v2 — session-based)

Base URL: `/api`. Protected routes require `Authorization: Bearer <token>`. Response shape: `{ success, data?, error? }`. Roles: `SUPER_ADMIN`, `ADMIN`, `HOD`, `TEACHER`, `STUDENT`.

## Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | Admin/Super Admin only | Create a User (student/teacher accounts are provisioned by admins, not self-signup, in most colleges — adjust if open signup is desired) |
| POST | `/auth/login` | Public | Returns access token + user; refresh token is an HttpOnly cookie |
| POST | `/auth/refresh` | Cookie | Rotates refresh cookie and returns access token + user |
| POST | `/auth/logout` | Cookie | Revoke server session and clear refresh cookie |

## Users / Departments / Academic structure (admin-managed)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | `/admin/departments` | Admin/Super Admin | List/create |
| GET/POST | `/admin/academic-years` | Admin/Super Admin | List/create |
| GET/POST | `/admin/semesters` | Admin/Super Admin | List/create, scoped to academic year |
| GET/POST | `/admin/courses` | Admin/Super Admin | List/create |
| GET/POST | `/admin/sections` | Admin/Super Admin | List/create |
| GET/POST | `/admin/subjects` | Admin/Super Admin | List/create |
| POST | `/admin/subject-teachers` | Admin/Super Admin/HOD | Assign a teacher to a subject for a section |
| POST/PUT | `/admin/students` | Admin | Create/edit student + linked User |
| POST/PUT | `/admin/teachers` | Admin/Super Admin | Create/edit teacher + linked User |
| POST | `/admin/students/import` | Admin | Bulk CSV/Excel import |
| POST/PUT | `/enrollment` | Admin/HOD | Enroll/drop a student from a subject |

## Timetable
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/timetable` | Any (scoped) | Filter by section/teacher |
| POST | `/timetable` | Admin/HOD | Create — server validates teacher/section/room overlap |
| PUT/DELETE | `/timetable/:id` | Admin/HOD | Edit/deactivate |

## Class sessions (new)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/sessions` | Teacher/HOD/Admin | Filter by date/section/teacher |
| POST | `/sessions` | Admin/HOD/system | Generate session(s) from timetable (usually automated, manual override allowed) |
| GET | `/sessions/:id` | Scoped | Session detail + roster |
| PUT | `/sessions/:id/status` | Teacher (own)/HOD/Admin | Transition scheduled→open→submitted→locked |
| POST | `/sessions/:id/attendance` | Teacher (own)/HOD/Admin | Body: `{ records: [{ studentId, status }] }` — bulk mark for the session |

## Attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| PUT | `/attendance/:id` | Teacher (before lock)/HOD/Admin | Edit a single record; blocked once session is `locked` (use corrections instead) |
| GET | `/attendance/session/:sessionId` | Scoped | All records for a session |
| GET | `/students/:id/attendance` | Self/Teacher/HOD/Admin | Full history, filterable `?subjectId=&from=&to=` |
| GET | `/students/:id/attendance/summary` | Self/Teacher/HOD/Admin | Computed %, eligible/counted sessions, condonation info |

## QR attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/attendance/qr/generate` | Teacher (own session) | Body: `{ sessionId }` → opaque short-lived token |
| POST | `/attendance/qr/scan` | Student | Body: `{ token }` → runs full verification checklist, marks present |
| PUT | `/attendance/qr/:qrId/revoke` | Teacher/HOD | Manually invalidate a live QR |

## Biometric enrollment (root of trust)
Initial enrollment binds a biometric identity to an institutional student account. It is a supervised, institution-approved event — an authenticated call or remote selfie upload alone is never sufficient. See BACKEND.md "Root of Trust".

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/enrollment/biometric` | Teacher/HOD/Admin/Super Admin | Initial **supervised** enrollment. Body: `{ studentId, enrollmentMethod, deviceId?, livenessPassed }`. Records `enrolled_by`; sets `enrollment_trust_state = ACTIVE`; writes `BIOMETRIC_ENROLLMENT` audit. Rejects if an active enrollment already exists (use re-enroll). Students cannot self-enroll. |
| POST | `/enrollment/biometric/reenroll` | Teacher/HOD/Admin/Super Admin | Authenticated recovery path (lost phone / new device). Re-verifies via staff, revokes the old device/template, increments `biometric_version`. A student cannot silently replace their own template. |
| PUT | `/enrollment/biometric/:studentId/revoke` | HOD/Admin/Super Admin | Revoke enrollment → `enrollment_trust_state = REQUIRES_REENROLLMENT`; writes `BIOMETRIC_REVOCATION` audit. |
| GET | `/enrollment/biometric/:studentId` | Self/Staff | Trust state + enrollment status/method/version. |

Assurance modes: **MODE_A** (account + QR/BLE/ESP32/dwell, no biometric), **MODE_B** (MODE_A + active enrollment + one randomized face/liveness), **MODE_C** (institution high-assurance). A student not `ACTIVE` cannot use Mode B/C; only institution policy sets fallback — a student cannot silently downgrade to Mode A.

Device attestation is submitted as an integrity **signal** (stored as `DeviceIntegrityEvent`), never as proof of identity. A missing/failed/unavailable attestation is handled by the institution's `AttestationPolicy` (`ALLOW_WITH_LOWER_ASSURANCE` / `REQUIRE_ALTERNATIVE_VERIFICATION` / `TEACHER_REVIEW`) — never an automatic rejection. Engine outcomes are `VERIFIED_PRESENT` / `REVIEW_REQUIRED` / `FALLBACK_REQUIRED`.

## Attendance corrections (new)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/attendance/corrections` | Student/Teacher | Body: `{ attendanceId, requestedStatus, reason, document? }` |
| GET | `/attendance/corrections` | HOD/Admin | Filter `?status=pending` |
| PUT | `/attendance/corrections/:id/approve` | HOD/Admin | Applies change + audit log + notification |
| PUT | `/attendance/corrections/:id/reject` | HOD/Admin | Body: `{ reason }` |

## Leave
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/leave` | Student | Body: `{ fromDate, toDate, reason, document }` (multipart) |
| GET | `/leave/student/:id` | Self/Teacher/HOD/Admin | List for a student |
| GET | `/leave?status=pending` | Teacher/HOD/Admin | Queue awaiting approval |
| PUT | `/leave/:id/approve` | Teacher (own students)/HOD/Admin | |
| PUT | `/leave/:id/reject` | Teacher/HOD/Admin | Body: `{ reason }` |

## Reports
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/reports/student/:id?format=pdf\|xlsx\|csv` | Self/Teacher/HOD/Admin | Subject-wise, overall %, absences, leave history, eligibility |
| GET | `/reports/section/:id?format=...` | Teacher/HOD/Admin | Section stats |
| GET | `/reports/subject/:id?format=...` | Teacher/HOD/Admin | Subject stats |
| GET | `/reports/department/:id?format=...` | HOD/Admin | Department-wide |

## Analytics
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/analytics/dashboard` | HOD/Admin | Org/department trends |
| GET | `/analytics/defaulters` | Teacher/HOD/Admin | Students below `Settings.minimum_attendance_percentage` |
| GET | `/analytics/audit-log?table=&from=&to=` | HOD (dept)/Admin | Filtered, read-only |

## Notifications
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | Self | Current user's notifications |
| PUT | `/notifications/:id/read` | Self | Mark read |

## Settings (new)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/settings` | Any (read relevant keys) | e.g. current minimum attendance % |
| PUT | `/settings/:key` | Admin/Super Admin | Update a configurable rule (never hardcode in frontend) |

## Common error codes
| Status | Meaning |
|---|---|
| 400 | Validation failure |
| 401 | Missing/invalid/expired token |
| 403 | Authenticated but wrong role or out-of-scope resource |
| 404 | Resource not found |
| 409 | Conflict (duplicate attendance, overlapping timetable, overlapping leave) |
| 423 | Locked (session locked — use corrections endpoint) |
| 500 | Server error |

Note: an integrity `FALLBACK_REQUIRED` or `REVIEW_REQUIRED` outcome is **not** an error status — it is a normal 200 response carrying the outcome, so unsupported-device students are routed to a fallback rather than being rejected as if they cheated.

## Bluetooth and authentication update (1.1)

All POST /auth operations require X-Requested-With: Threshold. Web/native clients use credentials-enabled requests. Bearer access tokens are bound to a revocable RefreshSession and roles are read from the database. Never send a refresh token in JSON.

| Method | Endpoint | Scope | Description |
| --- | --- | --- | --- |
| POST | /ble/start-session | Assigned teacher | timetableId; only during scheduled class time |
| GET | /ble/my-session | Assigned teacher | Active session and expiring rotating broadcast token |
| POST | /ble/scan | Enrolled student, same section | beaconId and integer rssi (-127 to -1); one observation per server window |
| GET | /ble/status | Student | Recorded dwell, progress and provisional requirement state |
| POST | /ble/finalize/:id | Assigned teacher | Transactional present records; missing evidence remains for review |
| POST | /ble/cancel/:id | Assigned teacher | Close signal without changing attendance |

The former internal /ble/auto-finalize route is removed. Finalization requires the assigned teacher. The teacher still reviews and submits the class roster separately. See BLUETOOTH_SECURITY.md for exact behavior and limits.
# Main RFID endpoints (1.3.0)

`POST /api/rfid/device/tap` uses `Authorization: Bearer <reader-key>` and `X-Reader-Id`, not a human JWT. Strict body: `{eventId: UUID, uid: hex, sentAt: epochMs}`. Server chooses student/class/direction and timestamp. Outcomes include RECORDED (IN/OUT), CAPTURED, CAPTURE_WAIT, DEBOUNCED, UNKNOWN_CARD, STUDENT_INACTIVE, STALE_TAP, NO_CLASS, AMBIGUOUS_CLASS, NOT_ENROLLED and SESSION_CLOSED. Replaying the same event returns its prior result; conflicting event reuse is rejected.

Other `/api/rfid` endpoints require the existing application JWT and active refresh session:

| Endpoint | Scope / purpose |
|---|---|
| GET `/my-day?date=YYYY-MM-DD` | Student's own classes, attendance and visits |
| GET `/day?date=YYYY-MM-DD` | Assigned teacher / HOD department / admin daily rosters |
| GET `/export?date=YYYY-MM-DD` | Same scoped daily data, Excel-safe CSV |
| GET/POST `/readers` | Admin list/create (key returned once on create) |
| PATCH `/readers/:id` | Admin enable/disable |
| POST `/readers/:id/rotate-key` | Admin revoke old key, return replacement once |
| POST/DELETE `/readers/:id/capture` | Admin supervised capture start/cancel |
| POST `/cards/assign` | Admin `{captureId,studentId}`, confirmed active capture |
| GET/POST `/students` | Admin registry/register account + automatic enrollments |
| POST `/students/import` | Admin `{sectionId,rows}`, 1–500 validated students, unique initial passwords |
| POST `/students/:id/revoke-card` | Admin `{reason}`, revoke current card |
| POST `/students/:id/deactivate` | Admin `{reason}`, revoke login/cards, retain records |
| POST `/timetable` | Admin teacher assignment + validated nonoverlapping slot + enrollments |
| GET/PUT `/policy` | Admin debounce, exit grace, maximum delivery age |

No RFID endpoint accepts a demo face result as attendance evidence. See [setup](../hardware/RFID-SETUP.md) for operational semantics and [database deployment](SUPABASE-RENDER-SETUP.md).


## Permanent face verification (1.4)

Authenticated Express API only; Supabase browser roles have no direct table access. Camera capture is supported in the updated Android app. Never submit client embeddings or liveness/match booleans.

| Endpoint | Authorization and behavior |
|---|---|
| `POST /face/enroll/challenge` | Scoped staff; studentId, enrollmentMethod, idConfirmed=true, consentRecorded=true, replace=false. Recovery uses replace=true and requires HOD/admin. Returns server actions/challengeId/expiresAt. |
| `POST /face/verify/challenge` | Student self; sessionId. Requires approved reference, active subject/section and an open authenticated RFID visit during class. Server chooses JOIN/SPOT and random actions. |
| `POST /face/challenges/:id/complete` | Same login/session/actor as issuance. Body only `{frames:[{atMs,jpeg}]}`; 8–32 bounded JPEGs, at most 4M base64 characters. Server computes identity/actions. 422 means retry/review; 503 can retry the same clip within expiry; 409 means used/expired/changed state. A success is idempotent for its exact previously accepted clip. |
| `GET /face/status/:sessionId` | Student self; approved-reference status, entry/random check status, due phase, deadline state. No templates or future random time returned. |
| `GET/PUT /face/policy` | Admin/super admin. required, match, continuity. Defaults required=false; snapshot at new RFID entry. |
| `GET /enrollment/biometric/:studentId` | Self or scoped staff; metadata/hasFace only, never template. |
| `PUT /enrollment/biometric/:studentId/revoke` | Scoped HOD/admin; atomically deletes template, changes version/trust and cancels pending checks. |

Legacy checkbox-only biometric enrollment POST endpoints return 410. Existing metadata stays readable but cannot satisfy face verification. Attendance requires independent classroom evidence, preserves staff decisions and uses the existing single calculation service. See [operation, privacy and remaining limits](PERMANENT-FACE-SETUP.md).
