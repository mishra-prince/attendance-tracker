import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../store/auth';

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
      <div className="text-center">
        <div className="text-signal text-2xl font-semibold tracking-tight">Attendance</div>
        <div className="text-ash text-sm mt-1">College · Sign in to continue</div>
      </div>

      <form onSubmit={submit} className="glass-medium rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 sweep relative overflow-hidden">
        <div>
          <label className="text-ash text-xs mb-1.5 block">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="text-ash text-xs mb-1.5 block">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="text-signal text-sm">{error}</div>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>

      <div className="glass-heavy rounded-2xl p-4 w-full max-w-sm">
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
      </div>
    </div>
  );
}
