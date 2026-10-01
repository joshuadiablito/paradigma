/**
 * A small least-recently-used cache that also shares in-flight promises, so
 * selecting the same word again makes one request, not many. Lives in
 * service-worker memory and is lost when Chrome stops the worker; that's fine.
 */
export class PromiseCache<T> {
  readonly #entries = new Map<string, Promise<T>>();

  constructor(private readonly capacity: number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.#entries.get(key);
    if (hit) {
      this.#entries.delete(key);
      this.#entries.set(key, hit);
      return hit;
    }
    const promise = load();
    this.#entries.set(key, promise);
    // Don't cache failures: the next lookup should retry.
    promise.catch(() => {
      if (this.#entries.get(key) === promise) this.#entries.delete(key);
    });
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    return promise;
  }

  get size(): number {
    return this.#entries.size;
  }
}
