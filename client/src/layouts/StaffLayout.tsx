import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, ClipboardCheck, Settings, LogOut, Menu, X, Sparkles, KeyRound, CheckSquare } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../store/auth';
import { spring } from '../components/motion';

export default function StaffLayout() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  const links = [
    { to: '/staff', icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/staff/take', icon: CheckSquare, label: 'Take Attendance' },
    { to: '/staff/sessions', icon: CalendarDays, label: 'Sessions' },
    { to: '/staff/approvals', icon: ClipboardCheck, label: 'Approvals' },
    { to: '/staff/analyzer', icon: Sparkles, label: 'AI Timetable' },
    { to: '/staff/join-code', icon: KeyRound, label: 'Join Code' },
    ...(isAdmin ? [{ to: '/staff/admin', icon: Settings, label: 'Admin' }] : []),
  ];

  const SidebarContent = (
    <>
      <div className="px-3 py-3">
        <div className="text-signal font-semibold tracking-tight">Threshold</div>
        <div className="text-muted text-xs mt-0.5">{user.role.replace('_', ' ')}</div>
      </div>
      <nav className="flex flex-col gap-1 mt-2">
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setDrawer(false)} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
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
    </>
  );

  return (
    <div className="min-h-full flex flex-col lg:flex-row overflow-x-hidden">
      {/* Phone: top bar with hamburger */}
      <header className="glass-heavy lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setDrawer(true)} aria-label="Menu" className="p-2 -ml-2 rounded-lg active:bg-white/10">
            <Menu size={20} />
          </button>
          <span className="text-signal font-semibold tracking-tight">Threshold</span>
        </div>
        <span className="text-muted text-xs">{user.role.replace('_', ' ')}</span>
      </header>

      {/* Phone: slide-in drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-50 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="glass-heavy fixed top-0 left-0 bottom-0 z-50 w-64 p-3 flex flex-col lg:hidden"
              style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={spring}
            >
              <button onClick={() => setDrawer(false)} className="self-end p-2 rounded-lg active:bg-white/10" aria-label="Close">
                <X size={18} />
              </button>
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop: permanent sidebar */}
      <aside className="glass-heavy w-60 m-4 rounded-2xl p-3 flex-col shrink-0 sticky top-4 self-start hidden lg:flex">
        {SidebarContent}
      </aside>

      <main className="flex-1 p-4 lg:p-6 max-w-[1200px] w-full min-w-0 mx-auto lg:mx-0">
        <Outlet />
      </main>
    </div>
  );
}
