/**
 * A lightweight, Map-based LRU Cache implementation.
 *
 * Takes advantage of JavaScript Map's insertion-order preservation property.
 * When the size exceeds maxSize, the first key (oldest inserted/accessed) is removed.
 * Getting or updating an item moves it to the end (most recently used).
 */
export class LRUCache<K, V> {
  private map: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.map = new Map<K, V>();
  }

  /**
   * Get an item from the cache.
   * Moving it to the end (most recently used) if it exists.
   */
  get(key: K): V | undefined {
    if (!this.map.has(key)) {
      return undefined;
    }
    const value = this.map.get(key)!;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /**
   * Set an item in the cache.
   * If the cache exceeds maxSize, the oldest item is evicted.
   */
  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);

    // Evict oldest item if size exceeds max
    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    return this;
  }

  /**
   * Check if a key exists in the cache.
   * Does NOT update its LRU status.
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Remove a key from the cache.
   */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /**
   * Clear all items from the cache.
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Returns the current number of items in the cache.
   */
  get size(): number {
    return this.map.size;
  }
}
