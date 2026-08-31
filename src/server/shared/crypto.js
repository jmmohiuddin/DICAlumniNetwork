/* ─── FIELD-LEVEL ENCRYPTION (REQ-14, PDPA 2026) ───
 * AES-256-GCM. The key comes from ENCRYPTION_KEY (64 hex chars). Without it the
 * vault endpoints refuse to operate rather than silently storing plaintext.
 */
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const encryptionReady = /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY);

if (!encryptionReady) {
  console.warn('⚠  ENCRYPTION_KEY missing or malformed — identity vault endpoints are disabled. ' +
               'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

function encryptField(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

function decryptField({ ciphertext, iv, auth_tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(auth_tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptField, decryptField, encryptionReady, ENCRYPTION_KEY };
