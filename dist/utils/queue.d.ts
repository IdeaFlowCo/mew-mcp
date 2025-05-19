/**
 * A queue for managing API requests with batching and rate limiting.
 */
export declare class RequestQueue {
    private queue;
    private processing;
    private batchSize;
    private maxDelay;
    private rateLimit;
    private lastRequestTime;
    private timeoutId?;
    constructor(batchSize: number, maxDelay: number, rateLimit: number);
    /**
     * Adds a request to the queue and processes it according to the configured rules.
     * @param request A function that returns a Promise for the API request
     * @returns A Promise that resolves with the request result
     */
    enqueue<T>(request: () => Promise<T>): Promise<T>;
    /**
     * Processes the queue according to the configured batch size and delay.
     */
    private processQueue;
    /**
     * Clears the queue and cancels any pending processing.
     */
    clear(): void;
    /**
     * Gets the current number of requests in the queue.
     */
    get length(): number;
}
