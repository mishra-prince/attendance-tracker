import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { FACE_MODEL, normalized } from './faceEvidence.service';
import { httpError } from '../middleware/error.middleware';

function key() {
  // Domain separation: the RFID HMAC key is never directly used as an AES key.
  const root = process.env.FACE_TEMPLATE_ENCRYPTION_KEY || process.env.RFID_CARD_HASH_SECRET;
  if (!root || root.length < 32) throw httpError(503, 'Face encryption is not configured');
  return Buffer.from(hkdfSync('sha256', root, 'threshold-face-template-v1', 'AES-256-GCM', 32));
}
function aad(student: string, version: number) { return Buffer.from(JSON.stringify([student, version, FACE_MODEL])); }
export function encryptFace(vector: number[], student: string, version: number) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(aad(student, version));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(normalized(vector))), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptFace(value: string, student: string, version: number) {
  try {
    const [format, iv, tag, payload] = value.split('.');
    if (format !== 'v1' || !iv || !tag || !payload) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    cipher.setAAD(aad(student, version)); cipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([cipher.update(Buffer.from(payload, 'base64')), cipher.final()]);
    return normalized(JSON.parse(plain.toString('utf8')));
  } catch { throw httpError(503, 'Face reference unavailable. Ask staff to check encryption or re-enroll.'); }
}
