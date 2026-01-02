import crypto from "crypto";

// Simple in-memory store: userId (or sessionId) -> Set of fingerprints
const store = new Map<string, Set<string>>();

export function addFingerprint(userId: string, fingerprint: string) {
  if (!store.has(userId)) store.set(userId, new Set());
  store.get(userId)!.add(fingerprint);
}

export function hasFingerprint(userId: string, fingerprint: string) {
  return store.has(userId) && store.get(userId)!.has(fingerprint);
}

export function fingerprintOf(prompt: string, correctAnswer: string) {
  return crypto
    .createHash("sha256")
    .update(prompt + "||" + correctAnswer)
    .digest("hex");
}

export function clearUser(userId: string) {
  store.delete(userId);
}

export function getFingerprints(userId: string) {
  return store.get(userId) ? Array.from(store.get(userId)!) : [];
}
