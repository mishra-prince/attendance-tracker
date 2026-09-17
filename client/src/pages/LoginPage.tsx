import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../store/auth';
import { spring } from '../components/motion';

const DEMO = [
  ['Student', 'student@att.edu'],
  ['Teacher', 'teacher@att.edu'],
  ['HOD', 'hod@att.edu'],
  ['Admin', 'admin@att.edu'],
  ['Super Admin', 'superadmin@att.edu'],
] as const;

export default function LoginPage() {
  const [email, setEmail] = useState('student@att.edu');
  const [password, setPassword] = useState('Password@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user } = res.data.data;
      login(user, accessToken, refreshToken);
      nav(user.role === 'STUDENT' ? '/student' : '/staff');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 gap-8">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <div className="text-signal text-2xl font-semibold tracking-tight">Attendance</div>
        <div className="text-ash text-sm mt-1">College · Sign in to continue</div>
      </motion.div>

      <motion.form
        onSubmit={submit}
        className="glass-medium rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 sweep relative overflow-hidden"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.08 }}
      >
        <div>
          <label className="text-ash text-xs mb-1.5 block">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="text-ash text-xs mb-1.5 block">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && (
          <motion.div
            className="text-signal text-sm"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
          >
            {error}
          </motion.div>
        )}
        <motion.button
          className="btn-primary"
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          animate={busy ? { opacity: 0.7 } : { opacity: 1 }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </motion.button>
      </motion.form>

      <motion.div
        className="glass-heavy rounded-2xl p-4 w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.16 }}
      >
        <div className="text-muted text-xs mb-2">Demo accounts — password: Password@123</div>
        <div className="flex flex-wrap gap-2">
          {DEMO.map(([label, mail]) => (
            <button
              key={mail}
              type="button"
              onClick={() => { setEmail(mail); setPassword('Password@123'); }}
              className="badge badge-neutral cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
