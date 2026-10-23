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
import rfidRoutes from './controllers/rfid.controller';
import { errorMiddleware } from './middleware/error.middleware';
import { prisma } from './utils/prisma';

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : false);

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [...(process.env.CLIENT_URL?.split(',').map((s) => s.trim()) || []), 'https://localhost', 'capacitor://localhost',
      ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost'] : [])];
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));
app.get('/ready', async (_req, res) => {
  try {
    await prisma.rfidReader.count();
    res.json({ success: true, data: { status: 'ready' } });
  } catch {
    res.status(503).json({ success: false, error: 'Database or RFID migration is unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/rfid', rfidRoutes);
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
