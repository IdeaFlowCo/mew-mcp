/**
 * A queue for managing API requests with batching and rate limiting.
 */
export class RequestQueue {
    private queue: Array<() => Promise<any>> = [];
    private processing = false;
    private batchSize: number;
    private maxDelay: number;
    private rateLimit: number;
    private lastRequestTime = 0;
    private timeoutId?: NodeJS.Timeout;

    constructor(batchSize: number, maxDelay: number, rateLimit: number) {
        this.batchSize = batchSize;
        this.maxDelay = maxDelay;
        this.rateLimit = rateLimit;
    }

    /**
     * Adds a request to the queue and processes it according to the configured rules.
     * @param request A function that returns a Promise for the API request
     * @returns A Promise that resolves with the request result
     */
    async enqueue<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    // Ensure rate limit
                    const now = Date.now();
                    const timeSinceLastRequest = now - this.lastRequestTime;
                    const minTimeBetweenRequests = 1000 / this.rateLimit;

                    if (timeSinceLastRequest < minTimeBetweenRequests) {
                        await new Promise((resolve) =>
                            setTimeout(
                                resolve,
                                minTimeBetweenRequests - timeSinceLastRequest
                            )
                        );
                    }

                    const result = await request();
                    this.lastRequestTime = Date.now();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });

            this.processQueue();
        });
    }

    /**
     * Processes the queue according to the configured batch size and delay.
     */
    private async processQueue(): Promise<void> {
        // If already processing or queue is empty, do nothing.
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        try {
            // Process queue items in a loop until empty
            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.batchSize);

                // Use Promise.allSettled to ensure all requests in the batch are processed
                // and to prevent an early exit if one request fails.
                // The individual promises returned by enqueue() are responsible for their own
                // resolution/rejection based on the outcome of the original request() function.
                await Promise.allSettled(
                    batch.map((req) => req())
                );


                // If there are still items in the queue, wait before processing the next batch
                if (this.queue.length > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.maxDelay)
                    );
                }
            }
        } catch (error) {
        } finally {
            // Ensure processing flag is reset once the queue is empty or an error occurs
            this.processing = false;
        }
    }

    /**
     * Clears the queue and cancels any pending processing.
     */
    clear(): void {
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
    get length(): number {
        return this.queue.length;
    }
}
