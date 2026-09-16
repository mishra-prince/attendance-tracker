import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';

/** Audit-log every mutation. Append-only — never updated or deleted. */
export async function audit(opts: {
  tableName: string;
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'LOCK';
  changedBy: string;
  oldValue?: any;
  newValue?: any;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}) {
  await prisma.auditLog.create({
    data: {
      table_name: opts.tableName,
      record_id: opts.recordId,
      action: opts.action,
      changed_by: opts.changedBy,
      old_value: opts.oldValue ?? undefined,
      new_value: opts.newValue ?? undefined,
      ip_address: opts.ip,
      user_agent: opts.userAgent,
      request_id: opts.requestId,
    },
  });
}

export function auditFromReq(req: any) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'] as string | undefined,
  };
}

export { audit as auditService };
