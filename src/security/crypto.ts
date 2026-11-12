/** Web Crypto only (works on Workers and Node); never node:crypto. */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export async function hmacSha256Hex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Base64 HMAC-SHA256 of `text` keyed by raw bytes. */
export async function hmacSha256Base64(key: Uint8Array<ArrayBuffer>, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(text))))
}

/**
 * The Standard Webhooks HMAC key: the base64-decoded bytes after the prefix of a `whsec_` secret,
 * else the secret's UTF-8 bytes.
 */
export function standardWebhooksKey(secret: string): Uint8Array<ArrayBuffer> {
  if (secret.startsWith('whsec_')) {
    try {
      return base64ToBytes(secret.slice('whsec_'.length))
    } catch {
      throw new Error('The signing secret starts with whsec_ but the rest is not valid base64.')
    }
  }
  return new TextEncoder().encode(secret)
}
