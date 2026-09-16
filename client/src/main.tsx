import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './index.css';
import { useAuth, Role } from './store/auth';
import LoginPage from './pages/LoginPage';
import StudentLayout from './layouts/StudentLayout';
import StaffLayout from './layouts/StaffLayout';
import StudentHome from './pages/student/StudentHome';
import StudentSessions from './pages/student/StudentSessions';
import StudentScan from './pages/student/StudentScan';
import StudentProfile from './pages/student/StudentProfile';
import StaffHome from './pages/staff/StaffHome';
import SessionsPage from './pages/staff/SessionsPage';
import SessionMark from './pages/staff/SessionMark';
import ApprovalsPage from './pages/staff/ApprovalsPage';
import AdminPage from './pages/staff/AdminPage';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<Protected roles={['STUDENT']} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentHome />} />
            <Route path="sessions" element={<StudentSessions />} />
            <Route path="scan" element={<StudentScan />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        <Route element={<Protected roles={['TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN']} />}>
          <Route path="/staff" element={<StaffLayout />}>
            <Route index element={<StaffHome />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="sessions/:id" element={<SessionMark />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
