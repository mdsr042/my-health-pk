const crypto = require('node:crypto');
const Store = require('electron-store');

function createSecretManager({ safeStorage }) {
  const store = new Store({
    name: 'desktop-secure-store',
    encryptionKey: 'my-health-desktop-runtime',
  });

  function getOrCreateMasterKey() {
    const encrypted = store.get('encryptedMasterKey');
    if (encrypted) {
      const buffer = Buffer.from(encrypted, 'base64');
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buffer);
      }
      return buffer.toString('utf8');
    }

    const rawKey = crypto.randomBytes(32).toString('base64');
    const storedValue = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(rawKey).toString('base64')
      : Buffer.from(rawKey, 'utf8').toString('base64');

    store.set('encryptedMasterKey', storedValue);
    return rawKey;
  }

  const masterKey = Buffer.from(getOrCreateMasterKey(), 'base64');

  function encryptText(value) {
    if (!value) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  function decryptText(value) {
    if (!value) return '';
    const payload = Buffer.from(String(value), 'base64');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  function encryptBuffer(buffer) {
    const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  function decryptBuffer(buffer) {
    const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? '');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  function hashPin(pin, salt) {
    return crypto.scryptSync(pin, salt, 64).toString('hex');
  }

  function checksumBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  return {
    encryptText,
    decryptText,
    encryptBuffer,
    decryptBuffer,
    hashPin,
    checksumBuffer,
  };
}

module.exports = {
  createSecretManager,
};
