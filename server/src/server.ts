import app from './app';
import cron from 'node-cron';
import { prisma } from './utils/prisma';
import { checkFaceWorker, closeFaceWorker } from './services/faceVision.service';
import { audit } from './services/audit.service';

const PORT = Number(process.env.PORT || 4100);

// Auto-lock sessions past the grace window: submitted → locked
async function autoLockSessions() {
  try {
    const s = await prisma.settings.findUnique({ where: { key: 'submission_edit_window_minutes' } });
    const window = s ? Number(s.value) : 30;
    const autoLock = await prisma.settings.findUnique({ where: { key: 'auto_lock_enabled' } });
    if (autoLock && autoLock.value !== 'true') return;

    const cutoff = new Date(Date.now() - window * 60 * 1000);
    const stale = await prisma.classSession.findMany({ where: { status: 'submitted', updated_at: { lt: cutoff } } });
    for (const sess of stale) {
      await prisma.classSession.update({ where: { session_id: sess.session_id }, data: { status: 'locked' } });
      const sys = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
      if (sys) {
        await audit({ tableName: 'ClassSession', recordId: sess.session_id, action: 'LOCK', changedBy: sys.user_id, oldValue: { status: 'submitted' }, newValue: { status: 'locked' } });
      }
    }
    if (stale.length) console.log(`[job] auto-locked ${stale.length} sessions`);
  } catch (e) {
    console.error('[job] autoLockSessions failed', e);
  }
}

cron.schedule('*/5 * * * *', autoLockSessions);

checkFaceWorker().then(() => {
  app.listen(PORT, () => { console.log(`Attendance Tracker API on :${PORT}`); });
}).catch(() => { console.error('Face verifier startup failed; refusing an unhealthy deployment'); process.exit(1); });
process.on('SIGTERM', () => { closeFaceWorker(); process.exit(0); });
