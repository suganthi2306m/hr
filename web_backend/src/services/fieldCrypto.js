const crypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';

function deriveKey() {
  const raw = String(process.env.PLATFORM_SECRETS_KEY || process.env.JWT_SECRET || 'livetrack-secret');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** AES-256-GCM; output is base64 prefixed for storage in MongoDB. */
function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Returns plaintext; legacy DB values without prefix are returned as-is. */
function decryptSecret(stored) {
  if (stored == null || stored === '') return '';
  const s = String(stored);
  if (!s.startsWith(ENC_PREFIX)) return s;
  const buf = Buffer.from(s.slice(ENC_PREFIX.length), 'base64');
  if (buf.length < 28) return '';
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  try {
    const key = deriveKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function isProbablyEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(ENC_PREFIX);
}

module.exports = { encryptSecret, decryptSecret, isProbablyEncrypted, ENC_PREFIX };
