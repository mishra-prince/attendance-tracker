import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../store/auth';
import { spring } from '../components/motion';

export default function StaffLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password, portal: 'staff' });
      const { accessToken, user } = res.data.data;
      login(user, accessToken);
      nav('/staff', { replace: true });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-10 gap-7">
      <motion.div
        className="flex flex-col items-center text-center gap-3"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <div className="w-14 h-14 rounded-2xl glass-heavy grid place-items-center">
          <ShieldCheck size={26} className="text-signal" />
        </div>
        <div>
          <div className="text-bone text-2xl font-semibold tracking-tight">Staff Portal</div>
          <div className="text-ash text-sm mt-1">Teachers &amp; administrators</div>
        </div>
      </motion.div>

      <motion.form
        onSubmit={submit}
        className="glass-medium rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 sweep relative overflow-hidden"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.08 }}
      >
        <div>
          <label htmlFor="email" className="text-ash text-xs mb-1.5 block">Work email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            placeholder="name@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="text-ash text-xs mb-1.5 block">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <motion.div
            role="alert"
            className="text-signal text-sm"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
          >
            {error}
          </motion.div>
        )}
        <motion.button
          className="btn-primary flex items-center justify-center gap-2"
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          animate={busy ? { opacity: 0.7 } : { opacity: 1 }}
        >
          {busy ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
        </motion.button>
      </motion.form>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.24 }}
      >
        <Link
          to="/login"
          className="text-muted text-xs flex items-center gap-1.5 hover:text-ash transition-colors"
        >
          <ArrowLeft size={13} /> Back to student sign-in
        </Link>
      </motion.div>
    </div>
  );
}
