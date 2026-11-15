const FORMAT = 'halo-encrypted-json'
const VERSION = 1
const ITERATIONS = 600_000
const SALT_LENGTH = 16
const IV_LENGTH = 12
const encoder = new TextEncoder()

type EncryptedJsonEnvelope = {
  format: typeof FORMAT
  version: typeof VERSION
  kdf: 'PBKDF2-SHA-256'
  iterations: typeof ITERATIONS
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure browser cryptography is unavailable. Open the dashboard over HTTPS or localhost.')
  }
  return globalThis.crypto
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    throw new Error('Encrypted JSON contains invalid encoded data.')
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const crypto = getCrypto()
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

function additionalData(): Uint8Array {
  return encoder.encode(`${FORMAT}|${VERSION}|PBKDF2-SHA-256|${ITERATIONS}|AES-256-GCM`)
}

function parseEnvelope(value: string): EncryptedJsonEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('This file is not a valid encrypted HALO JSON export.')
  }
  if (
    !isRecord(parsed)
    || parsed.format !== FORMAT
    || parsed.version !== VERSION
    || parsed.kdf !== 'PBKDF2-SHA-256'
    || parsed.iterations !== ITERATIONS
    || parsed.cipher !== 'AES-256-GCM'
    || typeof parsed.salt !== 'string'
    || typeof parsed.iv !== 'string'
    || typeof parsed.ciphertext !== 'string'
  ) {
    throw new Error('This encrypted JSON format or algorithm is not supported.')
  }
  return {
    format: FORMAT,
    version: VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: parsed.salt,
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
  }
}

export async function encryptJson(value: unknown, passphrase: string): Promise<string> {
  if (passphrase.length < 14) throw new Error('Use a passphrase with at least 14 characters.')
  const crypto = getCrypto()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt, 'encrypt')
  const plaintext = JSON.stringify(value)
  if (plaintext === undefined) throw new Error('The export does not contain valid JSON data.')
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  )
  const envelope: EncryptedJsonEnvelope = {
    format: FORMAT,
    version: VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(envelope, null, 2)
}

export async function decryptJson(encryptedValue: string, passphrase: string): Promise<unknown> {
  const envelope = parseEnvelope(encryptedValue)
  const salt = fromBase64(envelope.salt)
  const iv = fromBase64(envelope.iv)
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) {
    throw new Error('Encrypted JSON contains invalid cryptographic parameters.')
  }
  const crypto = getCrypto()
  const key = await deriveKey(passphrase, salt, 'decrypt')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(), tagLength: 128 },
    key,
    fromBase64(envelope.ciphertext),
  )
  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
  } catch {
    throw new Error('Decrypted data is not valid JSON.')
  }
}
