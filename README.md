# 📋 Attendance Tracker

A full-stack attendance management system with **role-based access**, **QR/join-code check-in**, **leave management**, **device integrity checks**, and a **Liquid Glass** dark UI — deployable as a web app or Android APK via Capacitor.

Built for college/university use: students check in, teachers create sessions, HODs/admins approve leaves and manage enrollment.

---

## ✨ Features

- **Role-based auth** — Student, Teacher, HOD, Admin (JWT, bcrypt)
- **Attendance sessions** — teachers create sessions with auto-generated join codes
- **Multi-method check-in** — join code, QR code, BLE beacon, or manual
- **Leave requests** — students apply, HOD/admin approves with notes
- **Device integrity** — detects rooted/emulator devices, assigns trust tiers
- **Supervised enrollment** — staff root-of-trust biometric capture, no self-enroll
- **Liquid Glass UI** — dark, translucent, depth-aware design (see `docs/DESIGN.md`)
- **Android APK** — Capacitor-wrapped, installable on any Android 8+ device
- **REST API** — Express + Prisma + PostgreSQL, fully typed with Zod validation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  Client (React + Vite + Tailwind + Capacitor)       │
│  ├── Web (vite dev / preview)                       │
│  └── Android APK (capacitor sync + gradle build)    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (REST)
┌──────────────────────▼──────────────────────────────┐
│  Server (Express + Prisma)                          │
│  ├── /api/auth/*        — register, login           │
│  ├── /api/sessions/*    — create, list, check-in    │
│  ├── /api/leaves/*      — apply, approve, reject    │
│  ├── /api/enrollment/*  — supervised enrollment     │
│  ├── /api/integrity/*   — device attestation        │
│  └── /api/dashboard/*   — stats, reports            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  PostgreSQL (Prisma ORM)                            │
│  Users, Sessions, Records, Leaves, Integrity,       │
│  Enrollment                                         │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 3, React Router 7 |
| Mobile | Capacitor 7 (Android) |
| Backend | Express 4, TypeScript, tsx |
| Database | PostgreSQL + Prisma 6 |
| Auth | JWT + bcryptjs |
| Validation | Zod |
| Design | Liquid Glass theme (custom CSS tokens) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (or Docker)

### 1. Database

```bash
# Option A: Docker
docker run -d --name att-postgres \
  -e POSTGRES_PASSWORD=attdev123 \
  -e POSTGRES_DB=attendance \
  -p 5544:5432 postgres:16

# Option B: use existing Postgres
```

### 2. Server

```bash
cd server
cp .env.example .env   # edit DATABASE_URL
npm install
npx prisma migrate dev
npm run dev            # → http://localhost:4100
```

### 3. Frontend (web)

```bash
cd client
npm install
npm run dev            # → http://localhost:5173 (proxies /api → :4100)
```

### 4. Android APK

```bash
cd client
npm run android:sync   # copies web build into android/
cd android && ./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

---

## 📡 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login, returns JWT |
| POST | `/api/sessions` | Teacher+ | Create attendance session |
| GET | `/api/sessions` | Any | List active sessions |
| POST | `/api/sessions/:id/checkin` | Student | Check in to session |
| GET | `/api/sessions/:id/records` | Teacher+ | View attendance records |
| POST | `/api/leaves` | Student | Apply for leave |
| GET | `/api/leaves` | Any | List leave requests |
| PATCH | `/api/leaves/:id` | HOD+ | Approve/reject leave |
| POST | `/api/enrollment` | Staff | Enroll student (supervised) |
| GET | `/api/enrollment/status` | Student | Check enrollment status |
| POST | `/api/integrity/report` | Any | Report device integrity |
| GET | `/api/dashboard` | Any | Attendance stats |

---

## 📁 Project Structure

```
attendance-tracker/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx         # Router + layout
│   │   ├── api.ts          # API client (fetch wrapper)
│   │   ├── pages/          # Login, Dashboard, Sessions, Leaves, Enrollment
│   │   ├── components/     # Glass cards, chips, modals
│   │   └── index.css       # Liquid Glass tokens + Tailwind
│   ├── android/            # Capacitor Android project
│   ├── capacitor.config.ts
│   └── vite.config.ts
├── server/                 # Express + Prisma API
│   ├── src/index.ts        # All routes in one file
│   ├── prisma/
│   │   ├── schema.prisma   # 6 models, 4 enums
│   │   └── migrations/     # 6 migrations
│   └── .env                # DATABASE_URL, JWT_SECRET, PORT
├── docs/
│   └── DESIGN.md           # Liquid Glass design system
└── README.md
```

---

## 🔐 Environment Variables

**server/.env**
```env
DATABASE_URL="postgresql://postgres:attdev123@localhost:5544/attendance"
JWT_SECRET="change-this-to-a-random-string"
PORT=4100
```

---

## 🎨 Design System

The UI uses the **Liquid Glass** theme — a dark, translucent design language:

- Frosted-glass cards with `backdrop-filter: blur(24px)`
- Near-black background (`#0a0a0f`) with subtle borders
- Indigo→violet accent gradients
- Signal colors: green (present), amber (late), red (absent)
- Safe-area padding for notched devices

Full token reference in [`docs/DESIGN.md`](docs/DESIGN.md).

---

## 📱 Android APK

The latest debug APK is built via Capacitor:

```bash
cd client/android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk` (~5.5 MB)

**Install on device:**
```bash
adb install -r app-debug.apk
```

---

## 🧪 Development

```bash
# Run both server + client concurrently
npm run dev          # from root (uses concurrently)

# Run server tests (if added)
cd server && npm test

# Type-check frontend
cd client && npx tsc --noEmit
```

---

## 📝 License

MIT — free to use, modify, and distribute.

---

## 👤 Author

**Prince Kumar Mishra** ([@mishra-prince](https://github.com/mishra-prince))

---

## 🙏 Acknowledgments

- Design inspired by Apple visionOS / iOS 26 Liquid Glass
- Built with [Prisma](https://prisma.io), [Capacitor](https://capacitorjs.com), [Tailwind CSS](https://tailwindcss.com)