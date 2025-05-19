/**
 * A simple in-memory cache with TTL (Time To Live) support.
 */
export declare class Cache<T> {
    private cache;
    private ttl;
    constructor(ttlMs: number);
    /**
     * Sets a value in the cache with the configured TTL.
     * @param key The cache key
     * @param value The value to cache
     */
    set(key: string, value: T): void;
    /**
     * Gets a value from the cache if it exists and hasn't expired.
     * @param key The cache key
     * @returns The cached value or undefined if not found/expired
     */
    get(key: string): T | undefined;
    /**
     * Removes a value from the cache.
     * @param key The cache key
     */
    delete(key: string): void;
    /**
     * Clears all values from the cache.
     */
    clear(): void;
    /**
     * Checks if a key exists in the cache and hasn't expired.
     * @param key The cache key
     * @returns boolean indicating if the key exists and is valid
     */
    has(key: string): boolean;
}
