// Clé publique VAPID (base64url, telle que fournie par `web-push
// generate-vapid-keys`) → octets attendus par PushManager.subscribe().

export function vapidKeyToBytes(base64url: string): Uint8Array {
  const trimmed = base64url.trim()
  const padded = trimmed + '='.repeat((4 - (trimmed.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
