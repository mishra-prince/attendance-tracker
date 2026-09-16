# API.md — REST Endpoint Reference (v2 — session-based)

Base URL: `/api`. Protected routes require `Authorization: Bearer <token>`. Response shape: `{ success, data?, error? }`. Roles: `SUPER_ADMIN`, `ADMIN`, `HOD`, `TEACHER`, `STUDENT`.

## Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | Admin/Super Admin only | Create a User (student/teacher accounts are provisioned by admins, not self-signup, in most colleges — adjust if open signup is desired) |
| POST | `/auth/login` | Public | Returns access + refresh token |
| POST | `/auth/refresh` | Cookie | New access token |
| POST | `/auth/logout` | Auth | Revoke refresh token |

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
