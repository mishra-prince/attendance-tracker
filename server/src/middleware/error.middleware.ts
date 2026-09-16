import { Request, Response, NextFunction } from 'express';

export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('[error]', err.message || err);

  if (err.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'Duplicate record (unique constraint violated)' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, error: 'Record not found' });
  }
  if (err.status) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  return res.status(500).json({ success: false, error: 'Internal server error' });
}

export function httpError(status: number, message: string) {
  const e = new Error(message) as any;
  e.status = status;
  return e;
}
