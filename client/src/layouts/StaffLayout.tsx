import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ClipboardCheck, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../store/auth';

export default function StaffLayout() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const links = [
    { to: '/staff', icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/staff/sessions', icon: CalendarDays, label: 'Sessions' },
    { to: '/staff/approvals', icon: ClipboardCheck, label: 'Approvals' },
    ...(isAdmin ? [{ to: '/staff/admin', icon: Settings, label: 'Admin' }] : []),
  ];

  return (
    <div className="flex min-h-full">
      <aside className="glass-heavy w-60 m-4 rounded-2xl p-3 flex flex-col shrink-0 sticky top-4 self-start">
        <div className="px-3 py-3">
          <div className="text-signal font-semibold">Attendance</div>
          <div className="text-muted text-xs mt-0.5">{user.role.replace('_', ' ')}</div>
        </div>
        <nav className="flex flex-col gap-1 mt-2">
          {links.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-link mt-auto text-left"
          onClick={() => { logout(); nav('/login'); }}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6 max-w-[1200px]">
        <Outlet />
      </main>
    </div>
  );
}
