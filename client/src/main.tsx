import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './index.css';
import { useAuth, Role } from './store/auth';
import useNativeTheme from './hooks/useNativeTheme';
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const StaffLoginPage = React.lazy(() => import('./pages/StaffLoginPage'));
import StudentLayout from './layouts/StudentLayout';
import StaffLayout from './layouts/StaffLayout';
const StudentHome = React.lazy(() => import('./pages/student/StudentHome'));
const StudentSessions = React.lazy(() => import('./pages/student/StudentSessions'));
const StudentScan = React.lazy(() => import('./pages/student/StudentScan'));
const StudentProfile = React.lazy(() => import('./pages/student/StudentProfile'));
const StudentAnalytics = React.lazy(() => import('./pages/student/StudentAnalytics'));
const NotificationsPage = React.lazy(() => import('./pages/student/NotificationsPage'));
const CondonationApply = React.lazy(() => import('./pages/student/CondonationApply'));
const StaffHome = React.lazy(() => import('./pages/staff/StaffHome'));
const SessionsPage = React.lazy(() => import('./pages/staff/SessionsPage'));
const SessionMark = React.lazy(() => import('./pages/staff/SessionMark'));
const ApprovalsPage = React.lazy(() => import('./pages/staff/ApprovalsPage'));
const AdminPage = React.lazy(() => import('./pages/staff/AdminPage'));
const RfidAttendance = React.lazy(() => import('./pages/staff/RfidAttendance'));
const RfidAdmin = React.lazy(() => import('./pages/staff/RfidAdmin'));
const TimetableAnalyzer = React.lazy(() => import('./pages/staff/TimetableAnalyzer'));
const JoinCodeStaff = React.lazy(() => import('./pages/staff/JoinCodeStaff'));
const TakeAttendance = React.lazy(() => import('./pages/staff/TakeAttendance'));
const BleSession = React.lazy(() => import('./pages/staff/BleSession'));
const SupervisedEnrollment = React.lazy(() => import('./pages/staff/SupervisedEnrollment'));
const JoinSectionStudent = React.lazy(() => import('./pages/student/JoinSectionStudent'));
const BleCheckin = React.lazy(() => import('./pages/student/BleCheckin'));
import { restoreSession } from './lib/api';
import ClassroomDemoButton from './components/ClassroomDemoButton';

function Protected({ roles }: { roles?: Role[] }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Home() {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'STUDENT' ? '/student' : '/staff'} replace />;
}

function BackHandler() {
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // Keep current location in a ref so the single listener always sees fresh values
  // without re-registering (re-registering on every nav stacks listeners → over-pops).
  const locRef = useRef(loc);
  locRef.current = loc;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let handle: { remove: () => void } | undefined;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (['/', '/student', '/staff', '/login', '/staff-login'].includes(locRef.current.pathname)) {
        CapApp.exitApp();
      } else if (canGoBack) {
        nav(-1);
      } else if (locRef.current.pathname !== '/') {
        nav('/', { replace: true });
      } else {
        CapApp.exitApp();
      }
    }).then((h) => { if (disposed) void h.remove(); else handle = h; }).catch(() => {});
    return () => { disposed = true; handle?.remove(); };
  }, []); // register exactly once
  return null;
}

function Shell() {
  useNativeTheme();
  const [ready, setReady] = useState(false);
  const authError = useAuth((s) => s.error);
  useEffect(() => { restoreSession().catch(() => {}).finally(() => setReady(true)); }, []);
  if (!ready) return <div className="min-h-full flex flex-col items-center justify-center gap-6 p-6 text-ash">
    <p role="status">Opening Threshold portal…</p>
    <div className="w-full max-w-sm"><ClassroomDemoButton /></div>
  </div>;
  return (
    <BrowserRouter>
      {authError && <div role="alert" className="connection-banner">{authError}</div>}
      <BackHandler />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/staff-login" element={<StaffLoginPage />} />

        <Route element={<Protected roles={['STUDENT']} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentHome />} />
            <Route path="sessions" element={<StudentSessions />} />
            <Route path="scan" element={<StudentScan />} />
            <Route path="auto" element={<BleCheckin />} />
            <Route path="analytics" element={<StudentAnalytics />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="condonation" element={<CondonationApply />} />
            <Route path="join" element={<JoinSectionStudent />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        <Route element={<Protected roles={['TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN']} />}>
          <Route path="/staff" element={<StaffLayout />}>
            <Route index element={<StaffHome />} />
            <Route path="take" element={<TakeAttendance />} />
            <Route path="ble" element={<BleSession />} />
            <Route path="enrollment" element={<SupervisedEnrollment />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="sessions/:id" element={<SessionMark />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="rfid" element={<RfidAttendance />} />
            <Route path="rfid/manage" element={<RfidAdmin />} />
            <Route path="analyzer" element={<TimetableAnalyzer />} />
            <Route path="join-code" element={<JoinCodeStaff />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="min-h-full grid place-items-center text-ash" role="status">Loading…</div>}><Shell /></React.Suspense>
  </React.StrictMode>
);
