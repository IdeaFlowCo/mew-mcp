/**
 * A queue for managing API requests with batching and rate limiting.
 */
export class RequestQueue {
    constructor(batchSize, maxDelay, rateLimit) {
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
        this.batchSize = batchSize;
        this.maxDelay = maxDelay;
        this.rateLimit = rateLimit;
    }
    /**
     * Adds a request to the queue and processes it according to the configured rules.
     * @param request A function that returns a Promise for the API request
     * @returns A Promise that resolves with the request result
     */
    async enqueue(request) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    // Ensure rate limit
                    const now = Date.now();
                    const timeSinceLastRequest = now - this.lastRequestTime;
                    const minTimeBetweenRequests = 1000 / this.rateLimit;
                    if (timeSinceLastRequest < minTimeBetweenRequests) {
                        await new Promise(resolve => setTimeout(resolve, minTimeBetweenRequests - timeSinceLastRequest));
                    }
                    const result = await request();
                    this.lastRequestTime = Date.now();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.processQueue();
        });
    }
    /**
     * Processes the queue according to the configured batch size and delay.
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        try {
            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.batchSize);
                await Promise.all(batch.map(request => request()));
                if (this.queue.length > 0) {
                    // Wait for the configured delay before processing the next batch
                    await new Promise(resolve => setTimeout(resolve, this.maxDelay));
                    await this.processQueue();
                }
            }
        }
        finally {
            this.processing = false;
        }
    }
    /**
     * Clears the queue and cancels any pending processing.
     */
    clear() {
        this.queue = [];
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
        }
        this.processing = false;
    }
    /**
     * Gets the current number of requests in the queue.
     */
    get length() {
        return this.queue.length;
    }
}
