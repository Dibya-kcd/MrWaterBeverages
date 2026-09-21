/**
 * Cryptographic helpers for PIN hashing and secure authentication.
 * Uses Web Crypto API (SHA-256) which is available natively in all modern
 * browsers and Node.js runtimes.
 */

const SALT = 'radhika_distribution_salesman_salt_v1_';

/**
 * Hashes a numeric PIN (or string) using SHA-256 with a salt.
 * Never stores or transmits plaintext PINs.
 */
export async function hashPin(pin: string, customSalt: string = SALT): Promise<string> {
  const cleanPin = pin.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(customSalt + cleanPin);
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback for non-subtle environments (basic deterministic hash)
  let hash = 0;
  const str = customSalt + cleanPin;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Verifies a candidate PIN against a stored hash.
 */
export async function verifyPin(candidatePin: string, storedHash: string, customSalt: string = SALT): Promise<boolean> {
  if (!candidatePin || !storedHash) return false;
  const computedHash = await hashPin(candidatePin, customSalt);
  return computedHash.toLowerCase() === storedHash.toLowerCase();
}
