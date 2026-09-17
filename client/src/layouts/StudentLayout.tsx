import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, CalendarDays, QrCode, BarChart3, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '../components/motion';

const tabs = [
  { to: '/student', icon: Home, label: 'Home', end: true },
  { to: '/student/sessions', icon: CalendarDays, label: 'Sessions' },
  { to: '/student/scan', icon: QrCode, label: 'Scan' },
  { to: '/student/analytics', icon: BarChart3, label: 'Stats' },
  { to: '/student/profile', icon: User, label: 'Profile' },
];

export default function StudentLayout() {
  const location = useLocation();
  return (
    <div className="min-h-full pb-28">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
      <nav className="bottom-nav glass-heavy">
        {tabs.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {({ isActive }) => (
              <>
                <motion.span
                  animate={isActive ? { scale: 1.12, y: -1 } : { scale: 1, y: 0 }}
                  transition={spring}
                  className="relative block"
                >
                  <Icon size={20} />
                  {isActive && (
                    <motion.span
                      layoutId="nav-dot"
                      className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-1 h-1 rounded-full bg-signal"
                      transition={spring}
                    />
                  )}
                </motion.span>
                <motion.span
                  animate={{ opacity: isActive ? 1 : 0.6 }}
                  transition={{ duration: 0.15 }}
                >
                  {label}
                </motion.span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
