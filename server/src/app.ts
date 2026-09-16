import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './controllers/auth.controller';
import attendanceRoutes from './controllers/attendance.controller';
import leaveRoutes from './controllers/leave.controller';
import adminRoutes from './controllers/admin.controller';
import { errorMiddleware } from './middleware/error.middleware';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || ['http://localhost:5173'], credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));

app.use('/api/auth', authRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', leaveRoutes);
app.use('/api', adminRoutes);

app.use(errorMiddleware);

export default app;
