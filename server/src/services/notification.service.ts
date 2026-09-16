import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';

/** In-app notifications always; email/sms best-effort (logged, never fail the request). */
export async function notify(opts: {
  userId: string;
  studentId?: string;
  message: string;
  type: 'low_attendance' | 'leave_status' | 'correction_status' | 'announcement';
  channel?: 'in_app' | 'email' | 'sms';
}) {
  const channel = opts.channel || 'in_app';
  try {
    await prisma.notification.create({
      data: {
        user_id: opts.userId,
        student_id: opts.studentId,
        message: opts.message,
        type: opts.type,
        channel,
        status: 'sent',
        sent_at: new Date(),
      },
    });
  } catch (err: any) {
    // never fail silently: record the failure row
    await prisma.notification.create({
      data: {
        user_id: opts.userId,
        student_id: opts.studentId,
        message: opts.message,
        type: opts.type,
        channel,
        status: 'failed',
        error_message: err.message?.slice(0, 500),
      },
    }).catch(() => {});
  }
}
