# FRONTEND.md — Frontend Architecture (v2 — audited)

## Stack
React (Vite) + TypeScript + Tailwind CSS + React Router + Axios + Zustand/Context for auth state.

## Folder structure
```
/client
  /src
    /components
      /ui           → Button, Card, Badge, Modal, Table, Input, Loader, Toast
      /layout       → Sidebar, TopNav, MobileTabBar, ProtectedRoute
      /attendance   → SessionAttendanceTable, StatusBadge, QRGenerator, QRScanner, CalendarHeatmap
      /corrections  → CorrectionRequestForm, CorrectionReviewCard
      /leave        → LeaveForm, LeaveStatusCard
      /notifications→ NotificationBell, NotificationList
      /reports      → ReportExportButton, AttendanceChart
      /admin        → SettingsForm, DepartmentForm, AuditLogTable
    /pages
      /auth         → Login.tsx
      /student      → StudentDashboard.tsx, AttendanceHistory.tsx, LeaveApply.tsx,
                       CorrectionRequest.tsx, Notifications.tsx
      /teacher      → TeacherDashboard.tsx, SessionAttendance.tsx (mark for a session),
                       GenerateQR.tsx, ClassReports.tsx, LeaveApprovals.tsx, CorrectionReview.tsx
      /hod          → HodDashboard.tsx, DepartmentReports.tsx, CorrectionApprovals.tsx,
                       LeaveApprovals.tsx
      /admin        → AdminDashboard.tsx, ManageUsers.tsx, ManageDepartments.tsx,
                       ManageCourses.tsx, Timetable.tsx, Analytics.tsx, Settings.tsx, AuditLog.tsx
    /hooks          → useAuth.ts, useAttendance.ts, useFetch.ts
    /store          → authStore.ts
    /api            → client.ts, auth.ts, session.ts, attendance.ts, correction.ts, leave.ts,
                       notification.ts, report.ts, settings.ts
    /utils          → dateHelpers.ts  (NOTE: attendance % is NOT calculated here — always read
                       from the backend summary endpoint, never recomputed client-side)
    /types          → user.ts, student.ts, session.ts, attendance.ts, leave.ts, correction.ts
    App.tsx
    main.tsx
```

## Routing map
```
/login                                    → public

/student/dashboard                        → overall %, subject cards, low-attendance warning, today's timetable
/student/attendance                       → filterable history + calendar heatmap
/student/leave                            → apply + track
/student/corrections                      → request a correction, track status
/student/notifications                    → notification center

/teacher/dashboard                        → today's sessions, current/next session
/teacher/sessions/:sessionId              → mark attendance for that specific session
/teacher/qr/:sessionId                    → generate live QR
/teacher/reports                          → subject/section stats
/teacher/leave                            → approve/reject for own students
/teacher/corrections                      → review requests tied to own sessions (if delegated)

/hod/dashboard                            → department attendance overview, low-attendance list
/hod/corrections                          → approve/reject correction requests
/hod/leave                                → department-level leave approvals
/hod/reports                              → department/course/section reports

/admin/dashboard                          → org-wide analytics
/admin/users                              → manage students/teachers (+ linked User accounts)
/admin/departments                        → departments, HOD assignment
/admin/courses                            → courses, sections, subjects, subject-teacher assignment
/admin/timetable                          → build/edit, conflict validation surfaced in UI
/admin/settings                           → minimum attendance %, which statuses count as present, lock window
/admin/audit-log                          → read-only, filterable
```
All non-auth routes wrapped in `<ProtectedRoute allowedRoles={[...]}>`; pages additionally verify resource scope server-side (frontend checks are UX only, never the security boundary).

## State management
- `authStore`: user id, role, JWT — nothing else global
- Server data fetched per page; attendance percentage is **always** pulled from `/students/:id/attendance/summary`, never derived client-side from raw records, to guarantee it matches the backend's single source of truth

## Key components — behavior notes

**SessionAttendanceTable**
- Loads the roster for one `ClassSession`, not a bare date/subject combo
- Disabled/read-only once the session status is `locked`; shows a "Request correction" action instead of an edit control in that state
- Status options in the UI match the schema: present / absent / late / excused / on_duty / medical

**QRGenerator / QRScanner**
- Generator shows a live countdown to token expiry and a manual "Revoke" button
- Scanner shows specific-but-safe error states (expired, already marked, not enrolled) without leaking which internal check failed in a way that helps probing

**CorrectionRequestForm**
- Student/teacher selects the attendance record, requested new status, reason, optional document
- Shows current status → requested status clearly; submission moves to a "pending" tracker

**NotificationBell / NotificationList**
- Polls or uses a lightweight push mechanism for unread count
- Marks read on open; groups by type (low attendance / leave / correction / announcement)

**CalendarHeatmap**
- One cell per day, colored by that day's session outcomes; click for subject-wise breakdown

**Settings (admin)**
- Form-driven, not free text — toggles for "late counts as present," "on_duty counts as present," numeric input for minimum %, all writing to `/settings/:key`
- Changing a setting shows a confirmation ("this affects all future percentage calculations")

## Integrity & biometric enrollment (frontend/mobile)

The mobile app participates in the integrity architecture (see BACKEND.md "Integrity engine" and AGENTS.md "Root of Trust"). Frontend rules:

- **No self-enrollment UI.** Students never create their own biometric identity. Initial enrollment happens at a **supervised station** operated by staff (`SupervisedEnrollment.tsx` under `/staff` or `/admin`), which captures a live face + liveness and posts to `/enrollment/biometric` with the staff member as `enrolled_by`. The student app only *shows* enrollment trust state (`UNENROLLED` / `PENDING_SUPERVISED_ENROLLMENT` / `ACTIVE` / `REVOKED` / `REQUIRES_REENROLLMENT`), never a "upload your selfie to enroll" flow.
- **Assurance mode is server-driven.** The client renders whatever the server requires for a session (Mode A = QR/BLE/dwell only; Mode B = one randomized face/liveness prompt; Mode C = institutional flow). The client must **never** let a user silently downgrade Mode B/C to Mode A — the mode comes from server policy, not a client toggle.
- **Device attestation is collected, not judged, on-device.** The app submits a Play Integrity / App Attest token as a *signal*. If attestation is unavailable/failed (old OS, no Play Services, manufacturer quirk), the app must **not** show accusatory copy. It shows a neutral state and follows the server's returned outcome:
  - `VERIFIED_PRESENT` → normal success.
  - `REVIEW_REQUIRED` → "sent for teacher review" (calm, non-accusatory).
  - `FALLBACK_REQUIRED` → route to the **stable fallback verification** screen. A student on an unsupported device must reach fallback without repeatedly having to prove their device is unsupported.
- **Never surface device capability as suspicion.** No UI copy like "your device looks insecure". Device limits are a technical state, not a dishonesty flag.
- **Enrollment/attestation errors** use the same neutral error+retry pattern below; a failed attestation is not an error state, it's an outcome the server resolves.

Suggested components/pages:
- `/staff/enrollment` → `SupervisedEnrollment.tsx` (staff-operated capture + liveness + institutional identity confirm)
- student `EnrollmentStatusCard` (read-only trust state; prompts "visit the enrollment desk" when `UNENROLLED`/`REQUIRES_REENROLLMENT`)
- `LivenessPrompt` (the single randomized Mode B check) and `FallbackVerification` (alternative path)

## Error & loading states (required on every data-fetching page)
Skeleton loader → content, explicit empty state, error state with retry — never a blank screen.

## Responsive rules
- Breakpoints: `sm 640 / md 768 / lg 1024 / xl 1280`
- QR scanner and session-marking flows are mobile-first — teachers often mark attendance standing in a classroom, students scan on their phones between classes
