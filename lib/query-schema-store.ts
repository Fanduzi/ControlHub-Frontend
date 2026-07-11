import type { ObjectDetailResponse } from "@/types/query-schema";

/**
 * Ephemeral in-memory store for schema metadata with TTL, eviction,
 * and concurrency control.
 *
 * Design constraints:
 * - Keyed by target id, database, kind, and object name
 * - 5-minute positive TTL for successful responses
 * - 30-second negative TTL for empty metadata
 * - Maximum 50 object-detail entries (oldest eviction)
 * - Maximum 5 concurrent object-detail requests
 * - Deduplicates identical in-flight requests
 * - Uses generations to reject stale writes
 * - Never persists to browser storage
 * - Clears on logout/auth failure
 */

const POSITIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_TTL_MS = 30 * 1000; // 30 seconds
const MAX_DETAIL_ENTRIES = 50;
const MAX_CONCURRENT_REQUESTS = 5;

/** Key identifying a specific schema object. */
export type SchemaStoreKey = {
  readonly targetId: number;
  readonly database: string;
  readonly kind: string;
  readonly name: string;
};

/** Per-key state machine: idle → loading → ready/error/stale. */
export type DetailState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: ObjectDetailResponse }
  | { readonly status: "error"; readonly error: string }
  | { readonly status: "stale"; readonly data: ObjectDetailResponse };

type DetailEntry = {
  readonly data: ObjectDetailResponse;
  readonly insertedAt: number;
  readonly generation: number;
};

type EmptyEntry = {
  readonly insertedAt: number;
  readonly generation: number;
};

export class QuerySchemaStore {
  private readonly details = new Map<string, DetailEntry>();
  private readonly empties = new Map<string, EmptyEntry>();
  private readonly loadingGenerations = new Map<string, number>();
  private readonly inflightPromises = new Map<string, Promise<ObjectDetailResponse>>();
  private readonly activeSlots = new Set<string>();
  private currentGeneration = 0;

  /**
   * Get the current state for a detail key.
   */
  getDetailState(key: SchemaStoreKey): DetailState {
    const keyStr = serializeKey(key);
    const now = Date.now();

    // Check if loading
    if (this.loadingGenerations.has(keyStr)) {
      return { status: "loading" };
    }

    // Check detail entry
    const detail = this.details.get(keyStr);
    if (detail) {
      const age = now - detail.insertedAt;
      if (age < POSITIVE_TTL_MS) {
        return { status: "ready", data: detail.data };
      }
      return { status: "stale", data: detail.data };
    }

    // Check empty entry (negative cache)
    const empty = this.empties.get(keyStr);
    if (empty) {
      const age = now - empty.insertedAt;
      if (age < NEGATIVE_TTL_MS) {
        return { status: "error", error: "empty" };
      }
    }

    return { status: "idle" };
  }

  /**
   * Set a detail entry as ready.
   */
  setDetail(key: SchemaStoreKey, data: ObjectDetailResponse): void {
    const keyStr = serializeKey(key);
    const generation = this.loadingGenerations.get(keyStr);

    // Ignore stale writes
    if (generation !== undefined && generation !== this.currentGeneration) {
      return;
    }

    this.loadingGenerations.delete(keyStr);
    this.empties.delete(keyStr);

    // Evict oldest if at capacity
    if (this.details.size >= MAX_DETAIL_ENTRIES && !this.details.has(keyStr)) {
      this.evictOldest();
    }

    this.details.set(keyStr, {
      data,
      insertedAt: Date.now(),
      generation: this.currentGeneration,
    });
  }

  /**
   * Mark a key as empty (negative cache).
   */
  setEmptyDetail(key: SchemaStoreKey): void {
    const keyStr = serializeKey(key);
    this.loadingGenerations.delete(keyStr);
    this.details.delete(keyStr);

    this.empties.set(keyStr, {
      insertedAt: Date.now(),
      generation: this.currentGeneration,
    });
  }

  /**
   * Mark a key as loading.
   */
  setDetailLoading(key: SchemaStoreKey): void {
    const keyStr = serializeKey(key);
    this.currentGeneration++;
    this.loadingGenerations.set(keyStr, this.currentGeneration);
  }

  /**
   * Get the current generation counter.
   */
  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * Set detail with explicit generation check.
   */
  setDetailForGeneration(
    key: SchemaStoreKey,
    data: ObjectDetailResponse,
    generation: number,
  ): void {
    const keyStr = serializeKey(key);
    const expectedGeneration = this.loadingGenerations.get(keyStr);

    // Ignore stale writes
    if (expectedGeneration !== undefined && expectedGeneration !== generation) {
      return;
    }

    this.loadingGenerations.delete(keyStr);
    this.empties.delete(keyStr);

    // Evict oldest if at capacity
    if (this.details.size >= MAX_DETAIL_ENTRIES && !this.details.has(keyStr)) {
      this.evictOldest();
    }

    this.details.set(keyStr, {
      data,
      insertedAt: Date.now(),
      generation,
    });
  }

  /**
   * Refresh a specific key (bypass cache).
   */
  refreshDetail(key: SchemaStoreKey): void {
    const keyStr = serializeKey(key);
    this.details.delete(keyStr);
    this.empties.delete(keyStr);
    this.setDetailLoading(key);
  }

  /**
   * Acquire a concurrency slot for a detail request.
   * Returns true if acquired, false if at capacity.
   */
  acquireDetailSlot(key: SchemaStoreKey): boolean {
    const keyStr = serializeKey(key);

    if (this.activeSlots.size >= MAX_CONCURRENT_REQUESTS) {
      return false;
    }

    this.activeSlots.add(keyStr);
    return true;
  }

  /**
   * Release a concurrency slot.
   */
  releaseDetailSlot(key: SchemaStoreKey): void {
    const keyStr = serializeKey(key);
    this.activeSlots.delete(keyStr);
  }

  /**
   * Get or create a deduplicated promise for a detail request.
   */
  getOrCreateDetailPromise(
    key: SchemaStoreKey,
    fetcher: () => Promise<ObjectDetailResponse>,
  ): Promise<ObjectDetailResponse> {
    const keyStr = serializeKey(key);
    const existing = this.inflightPromises.get(keyStr);

    if (existing) {
      return existing;
    }

    const promise = fetcher().finally(() => {
      this.inflightPromises.delete(keyStr);
    });

    this.inflightPromises.set(keyStr, promise);
    return promise;
  }

  /**
   * Clear all entries (e.g., on auth failure).
   */
  clear(): void {
    this.details.clear();
    this.empties.clear();
    this.loadingGenerations.clear();
    this.inflightPromises.clear();
    this.activeSlots.clear();
  }

  /**
   * Evict the oldest detail entry.
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.details) {
      if (entry.insertedAt < oldestTime) {
        oldestTime = entry.insertedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.details.delete(oldestKey);
    }
  }
}

/**
 * Serialize a store key to a string for Map usage.
 */
function serializeKey(key: SchemaStoreKey): string {
  return `${key.targetId}:${key.database}:${key.kind}:${key.name}`;
}
