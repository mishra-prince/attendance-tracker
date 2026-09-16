# AGENTS.md — College Attendance Tracker (v2 — audited)

Instructions for any AI coding agent (Claude Code, Cursor, Codex, etc.) building or modifying this project. Read this file first, then the linked docs before writing code.

## Related docs
- `DESIGN.md` — visual design system, colors, typography, UX rules
- `FRONTEND.md` — frontend architecture, folder structure, pages/components
- `BACKEND.md` — backend architecture, auth, RBAC, attendance/session/QR/correction logic
- `DATABASE.md` — schema and entity relationships (session-based, v2)
- `API.md` — REST endpoint reference (v2)

## Project summary
A full-stack college attendance tracker for five roles — Student, Teacher, HOD, Admin, Super Admin — with **session-based** attendance (not date-only), QR check-in, leave management, correction workflow, and configurable low-attendance alerts.

## Tech stack
- Frontend: React (Vite) + TypeScript + Tailwind CSS + React Router
- Backend: Node.js + Express + TypeScript + Prisma
- Database: PostgreSQL
- Auth: central `User` table, JWT access + refresh, bcrypt/argon2
- Notifications: Nodemailer (email), Twilio (optional SMS)
- QR: `qrcode` (generate), `html5-qrcode` (scan) — token-only payload, never raw data

## Repo structure
```
/client        → React frontend (see FRONTEND.md)
/server        → Express backend (see BACKEND.md)
/server/prisma → schema.prisma, migrations, seed.ts
/docs          → this file + DESIGN.md, FRONTEND.md, BACKEND.md, DATABASE.md, API.md
.env.example
README.md
```

## If working against an EXISTING codebase — read this first
Do not blindly rewrite. Before touching code, produce a short internal plan covering:
1. Current database schema vs. the v2 schema in `DATABASE.md` — what's missing/wrong
2. Current auth architecture vs. the central `User` model
3. Current attendance architecture (likely date-only) vs. `ClassSession`-based
4. What must be migrated (data, not just schema)
5. What API routes change or are added
6. What frontend components/pages are affected
7. What existing functionality could break, and how you'll avoid regressions

Only after that plan, implement incrementally. Preserve working UI and functionality where the new schema doesn't require changing it.

## Setup commands
```bash
cd server && npm install && npx prisma migrate dev && npm run seed && npm run dev
cd client && npm install && npm run dev
```

## Coding standards
- TypeScript on both frontend and backend
- One component per file; PascalCase components, camelCase functions/vars
- API responses: `{ success: boolean, data?: any, error?: string }`
- Validate all inputs server-side even if validated client-side
- **Never trust `role` or resource ownership from the client** — re-derive from JWT + DB, check both role AND scope (e.g., "this teacher owns this session") on every request
- **Attendance percentage is calculated in exactly one place** (`attendance.service.ts`) — never re-implement the formula in a frontend component or a second backend function
- **No hardcoded thresholds** — minimum attendance %, which statuses count as present, lock windows, etc. all come from `Settings`, not constants
- Audit log every mutation on attendance, corrections, leave approvals, timetable, and settings

## Build order — do not skip ahead

**Phase 1 — Foundation**
1. User model + auth (central, all roles)
2. RBAC middleware (role + resource scope)
3. Department
4. Course
5. AcademicYear
6. Semester
7. Section
8. Student (linked to User)
9. Teacher (linked to User)
10. Subject + SubjectTeacher
11. Enrollment

**Phase 2 — Attendance core**
12. Timetable (with overlap validation)
13. ClassSession (generation from timetable)
14. Attendance (session-based, unique constraint)
15. Attendance calculation service (single source of truth)
16. Attendance locking (scheduled→open→submitted→locked)
17. Student dashboard
18. Teacher dashboard

**Phase 3 — Workflows**
19. Leave
20. Notifications
21. Attendance corrections
22. Audit logs
23. Reports

**Phase 4 — Advanced**
24. QR attendance (token-based, full verification checklist)
25. Analytics
26. Condonation calculator (separate from core % calc)
27. Bulk Excel/CSV import
28. Geofencing
29. Proxy/buddy-punching detection (flag, don't auto-block, initially)
30. Parent notifications (via existing email/phone fields — no Parent role yet)
31. Offline mode
32. Gamification
33. Multilingual support

## Testing expectations
- Auth: login, invalid password, expired token, role restriction
- Attendance: mark present/absent, duplicate mark rejected, wrong section rejected, locked session rejected, percentage calculation edge cases (zero eligible sessions, all medical/excused)
- QR: valid, expired, revoked, duplicate scan, unauthorized student — all rejected correctly
- Leave: create, approve, reject, invalid/overlapping dates
- Permissions: verify every role cannot access resources outside its scope (not just outside its role)

## Definition of done for any feature
- Correct for all five roles as scoped
- Loading and error states handled in UI
- Server validates input, returns correct HTTP status (400/401/403/404/409/423/500)
- Relevant mutations write an AuditLog entry
- No secrets committed; every env var documented in README

## Post-implementation checklist
- Run migrations, run seed script, run backend tests, run frontend build
- Fix all TypeScript/lint/build errors
- Manually verify RBAC for each of the 5 roles
- Verify attendance calculation against the rules in `Settings`
- Verify QR verification checklist rejects every invalid case
- Update README with demo credentials and env var docs
