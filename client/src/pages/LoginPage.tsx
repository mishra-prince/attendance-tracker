import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Bluetooth, Eye, EyeOff } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { apiConfigured } from '../lib/config';
import { useAuth } from '../store/auth';
import ClassroomDemoButton from '../components/ClassroomDemoButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await api.post('/auth/login', { email: email.trim(), password, portal: 'student' });
      const { accessToken, user } = response.data.data;
      login(user, accessToken); navigate('/student', { replace: true });
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-wordmark"><span className="icon-tile"><Bluetooth size={23} className="text-signal" /></span>threshold<span className="text-signal">/</span></div>
        <p className="eyebrow !mt-0 !mb-4">SHOW UP. KEEP GOING.</p>
        <h1>Your presence.<br /><span>Made simple.</span></h1>
        <p>One less thing between you and learning. Check in with your phone and keep your attendance in view.</p>
        <p className="login-note"><ShieldCheck size={16} /> Your institution. Your attendance. One place.</p>
      </section>
      <section className="login-form-panel glass-medium">
        <div><p className="eyebrow mb-2">STUDENT PORTAL</p><h2>Welcome back.</h2><p className="text-ash text-sm mt-2">Sign in with your institution account.</p></div>
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <label className="text-sm text-ash" htmlFor="email">College email<input className="input mt-2" id="email" type="email" autoComplete="username" placeholder="you@college.edu" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-sm text-ash" htmlFor="password">Password<div className="password-field mt-2"><input className="input" id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {!apiConfigured && <p className="notice">This app is not connected to your institution yet. Contact your administrator.</p>}
          {error && <p role="alert" className="notice notice-error">{error}</p>}
          <button className="btn-primary flex items-center justify-between" disabled={busy || !apiConfigured}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></button>
        </form>
        <ClassroomDemoButton />
        <p className="text-xs text-ash leading-relaxed">Need an account or a password reset? Your institution’s administrator can help.</p>
        <div className="border-t border-white/10 pt-5"><Link to="/staff-login" className="text-ash text-xs no-underline flex items-center justify-between"><span className="flex items-center gap-2"><ShieldCheck size={15} />Teacher or administrator?</span><ArrowRight size={16} /></Link></div>
      </section>
    </main>
  );
}
