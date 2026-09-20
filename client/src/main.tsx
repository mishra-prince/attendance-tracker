import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import './index.css';
import { useAuth, Role } from './store/auth';
import useNativeTheme from './hooks/useNativeTheme';
import LoginPage from './pages/LoginPage';
import StaffLoginPage from './pages/StaffLoginPage';
import StudentLayout from './layouts/StudentLayout';
import StaffLayout from './layouts/StaffLayout';
import StudentHome from './pages/student/StudentHome';
import StudentSessions from './pages/student/StudentSessions';
import StudentScan from './pages/student/StudentScan';
import StudentProfile from './pages/student/StudentProfile';
import StudentAnalytics from './pages/student/StudentAnalytics';
import NotificationsPage from './pages/student/NotificationsPage';
import CondonationApply from './pages/student/CondonationApply';
import StaffHome from './pages/staff/StaffHome';
import SessionsPage from './pages/staff/SessionsPage';
import SessionMark from './pages/staff/SessionMark';
import ApprovalsPage from './pages/staff/ApprovalsPage';
import AdminPage from './pages/staff/AdminPage';
import TimetableAnalyzer from './pages/staff/TimetableAnalyzer';
import JoinCodeStaff from './pages/staff/JoinCodeStaff';
import TakeAttendance from './pages/staff/TakeAttendance';
import BleSession from './pages/staff/BleSession';
import SupervisedEnrollment from './pages/staff/SupervisedEnrollment';
import JoinSectionStudent from './pages/student/JoinSectionStudent';
import BleCheckin from './pages/student/BleCheckin';

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
  // Keep current location in a ref so the single listener always sees fresh values
  // without re-registering (re-registering on every nav stacks listeners → over-pops).
  const locRef = useRef(loc);
  locRef.current = loc;
  useEffect(() => {
    let handle: { remove: () => void } | undefined;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        nav(-1);
      } else if (locRef.current.pathname !== '/') {
        nav('/', { replace: true });
      } else {
        CapApp.exitApp();
      }
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, []); // register exactly once
  return null;
}

function Shell() {
  useNativeTheme();
  return (
    <BrowserRouter>
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
    <Shell />
  </React.StrictMode>
);
