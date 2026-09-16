import { NavLink, Outlet } from 'react-router-dom';
import { Home, CalendarDays, QrCode, User } from 'lucide-react';

const tabs = [
  { to: '/student', icon: Home, label: 'Home', end: true },
  { to: '/student/sessions', icon: CalendarDays, label: 'Sessions' },
  { to: '/student/scan', icon: QrCode, label: 'Scan' },
  { to: '/student/profile', icon: User, label: 'Profile' },
];

export default function StudentLayout() {
  return (
    <div className="min-h-full pb-28">
      <Outlet />
      <nav className="bottom-nav glass-heavy">
        {tabs.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
