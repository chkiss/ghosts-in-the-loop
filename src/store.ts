// localStorage JSON reads, safe in private mode (and against corrupt values):
// any failure returns the fallback instead of throwing.

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
