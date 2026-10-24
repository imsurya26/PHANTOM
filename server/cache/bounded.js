/** JSON-only LRU with retention and both entry/serialized-byte ceilings. */
export class BoundedCache {
  constructor({ maxEntries, maxBytes, ttlMs, now = Date.now }) {
    if (
      ![maxEntries, maxBytes, ttlMs].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      )
    )
      throw new TypeError('Cache limits must be positive integers');
    Object.assign(this, { maxEntries, maxBytes, ttlMs, now });
    this.items = new Map();
    this.bytes = 0;
    this.nextPrune = 0;
  }
  get size() {
    this.prune(true);
    return this.items.size;
  }
  get(key) {
    const entry = this.items.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.delete(key);
      return undefined;
    }
    this.items.delete(key);
    this.items.set(key, entry);
    return JSON.parse(entry.serialized);
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  set(key, value, ttlMs = this.ttlMs) {
    if (typeof key !== 'string')
      throw new TypeError('Cache keys must be strings');
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > this.ttlMs)
      throw new TypeError('Invalid cache retention');
    const serialized = JSON.stringify(value);
    if (serialized === undefined)
      throw new TypeError('Cache values must be JSON serializable');
    const bytes =
      Buffer.byteLength(JSON.stringify(key)) +
      Buffer.byteLength(serialized) +
      3;
    this.delete(key);
    if (bytes > this.maxBytes) return this;
    this.prune();
    if (
      this.items.size >= this.maxEntries ||
      this.bytes + bytes > this.maxBytes
    )
      this.prune(true);
    while (
      this.items.size >= this.maxEntries ||
      this.bytes + bytes > this.maxBytes
    )
      this.delete(this.items.keys().next().value);
    this.items.set(key, { serialized, bytes, expires: this.now() + ttlMs });
    this.bytes += bytes;
    return this;
  }
  delete(key) {
    const entry = this.items.get(key);
    if (!entry) return false;
    this.bytes -= entry.bytes;
    return this.items.delete(key);
  }
  prune(force = false) {
    const now = this.now();
    if (!force && now < this.nextPrune) return;
    this.nextPrune = now + Math.min(1000, this.ttlMs);
    for (const [key, entry] of this.items)
      if (entry.expires <= now) this.delete(key);
  }
  *entries() {
    this.prune(true);
    for (const [key, entry] of this.items)
      yield [key, JSON.parse(entry.serialized)];
  }
}
