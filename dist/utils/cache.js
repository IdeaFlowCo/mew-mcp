/**
 * A simple in-memory cache with TTL (Time To Live) support.
 */
export class Cache {
    constructor(ttlMs) {
        this.cache = new Map();
        this.ttl = ttlMs;
    }
    /**
     * Sets a value in the cache with the configured TTL.
     * @param key The cache key
     * @param value The value to cache
     */
    set(key, value) {
        const expiry = Date.now() + this.ttl;
        this.cache.set(key, { value, expiry });
    }
    /**
     * Gets a value from the cache if it exists and hasn't expired.
     * @param key The cache key
     * @returns The cached value or undefined if not found/expired
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item)
            return undefined;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return undefined;
        }
        return item.value;
    }
    /**
     * Removes a value from the cache.
     * @param key The cache key
     */
    delete(key) {
        this.cache.delete(key);
    }
    /**
     * Clears all values from the cache.
     */
    clear() {
        this.cache.clear();
    }
    /**
     * Checks if a key exists in the cache and hasn't expired.
     * @param key The cache key
     * @returns boolean indicating if the key exists and is valid
     */
    has(key) {
        const item = this.cache.get(key);
        if (!item)
            return false;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
}
