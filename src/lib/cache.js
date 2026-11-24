/**
 * Tiny in-memory TTL cache.
 * Keeps repeated searches fast and protects the upstream API from bursts.
 * Oldest entry is evicted when maxEntries is reached (Map keeps insertion order).
 */
class TTLCache {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 500, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  get size() {
    return this.store.size;
  }
}

module.exports = TTLCache;
