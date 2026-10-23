import type { Request, Response, NextFunction } from 'express';

let active = false;
/** Reject before JSON decoding, so a classroom burst cannot queue dozens of large image bodies. */
export function faceUploadAdmission(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control','no-store');
  if (active) {
    res.setHeader('Retry-After','3'); req.resume();
    res.status(503).json({success:false,error:'Face verifier is busy. Your app can retry the captured sequence shortly.'}); return;
  }
  active = true; let released = false;
  const release = () => { if(!released) {released=true;active=false;} };
  res.once('finish',release);res.once('close',release);
  next();
}
