import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './controllers/auth.controller';
import attendanceRoutes from './controllers/attendance.controller';
import leaveRoutes from './controllers/leave.controller';
import adminRoutes from './controllers/admin.controller';
import featuresRoutes from './controllers/features.controller';
import aiRoutes from './controllers/ai.controller';
import classroomRoutes from './controllers/classroom.controller';
import bleRoutes from './controllers/ble.controller';
import enrollmentRoutes from './controllers/enrollment.controller';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

app.set('trust proxy', 1); // behind Cloudflare tunnel — fixes express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [...(process.env.CLIENT_URL?.split(',') || []), 'http://localhost:5173', 'https://localhost', 'http://localhost', 'capacitor://localhost'];
    // Match the host on a dot boundary so 'eviltthreshold.dpdns.org' can't slip through.
    let host = '';
    try { host = new URL(origin || '').hostname; } catch { /* non-URL origin */ }
    const okSuffix = host === 'threshold.dpdns.org' || host.endsWith('.threshold.dpdns.org');
    if (!origin || allowed.includes(origin) || okSuffix) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));

app.use('/api/auth', authRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', leaveRoutes);
app.use('/api', adminRoutes);
app.use('/api', featuresRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/ble', bleRoutes);
app.use('/api/enrollment', enrollmentRoutes);

app.use(errorMiddleware);

export default app;
