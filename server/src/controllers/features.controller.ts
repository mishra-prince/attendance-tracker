import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from '../services/audit.service';

const router = Router();
router.use(authMiddleware);

// ---- Feature flags (server-side, admin toggleable) ----
export const DEFAULT_FLAGS = {
  ai_timetable: true,      // AI timetable image analyzer
  join_codes: true,        // teacher unique join codes
  ble_auto_attendance: true, // BLE auto-attendance engine
  esp32_anchor: false,     // ESP32 wall-anchor cross-check (OFF until enabled)
};

export async function getFlags(): Promise<Record<string, boolean>> {
  const rows = await prisma.settings.findMany({ where: { key: { startsWith: 'flag_' } } });
  const flags: Record<string, boolean> = { ...DEFAULT_FLAGS };
  for (const r of rows) {
    const name = r.key.replace('flag_', '');
    if (name in DEFAULT_FLAGS) flags[name] = r.value === 'true';
  }
  return flags;
}

export async function flagEnabled(name: string): Promise<boolean> {
  const flags = await getFlags();
  return !!flags[name];
}

// Get all flags (any logged-in user — UI needs to know what's on)
router.get('/features', async (req: AuthRequest, res, next) => {
  try {
    res.json({ success: true, data: await getFlags() });
  } catch (e) { next(e); }
});

// Toggle a flag (ADMIN/SUPER_ADMIN only) — the "flag button"
router.post('/features/:name', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { name } = req.params;
    if (!(name in DEFAULT_FLAGS)) throw httpError(400, 'Unknown feature flag');
    const enabled = !!(req.body?.enabled);
    await prisma.settings.upsert({
      where: { key: `flag_${name}` },
      update: { value: String(enabled), updated_by: req.user!.userId },
      create: { key: `flag_${name}`, value: String(enabled), updated_by: req.user!.userId },
    });
    await audit({ tableName: 'Settings', recordId: `flag_${name}`, action: 'UPDATE', changedBy: req.user!.userId, newValue: { enabled }, ...auditFromReq(req) });
    res.json({ success: true, data: await getFlags() });
  } catch (e) { next(e); }
});

export default router;
