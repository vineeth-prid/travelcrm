import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Reversible encryption for the one secret this application has to be able to
 * read back: the SMTP password.
 *
 * Passwords for *people* are hashed with bcrypt and never recovered. An SMTP
 * password is different — the server must present it to the mail host — so it
 * is encrypted rather than hashed. AES-256-GCM, so tampering is detected
 * rather than silently decrypting to rubbish.
 *
 * The key is derived from JWT_SECRET. That keeps the number of secrets an
 * operator has to manage at one, at the cost of a documented consequence:
 * rotating JWT_SECRET makes a stored SMTP password unreadable, and it has to
 * be entered again. Nothing else is lost, and the failure is loud.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * A fixed salt. Normally a cardinal sin, but the input here is a
 * high-entropy server secret rather than a human password, so the salt is not
 * doing rainbow-table duty — and a random one would have to be stored beside
 * every ciphertext for no gain.
 */
const SALT = 'travel-crm/smtp/v1';

function keyFrom(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LENGTH);
}

/** `iv.ciphertext.tag`, all base64url. */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

  return [
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

/**
 * Returns null rather than throwing when the value cannot be read — which is
 * what happens after JWT_SECRET is rotated. The caller reports "re-enter the
 * password", which is more use than a stack trace.
 */
export function decryptSecret(stored: string, secret: string): string | null {
  const [iv, payload, tag] = stored.split('.');
  if (!iv || !payload || !tag) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
