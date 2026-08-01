import "@testing-library/jest-dom/vitest";

// Mock ResizeObserver for components that use it (e.g., cmdk Command component).
// jsdom does not provide ResizeObserver, so we need to polyfill it for tests.
class ResizeObserverMock {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    // no-op
  }

  unobserve() {
    // no-op
  }

  disconnect() {
    // no-op
  }
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Mock scrollIntoView for components that use it (e.g., cmdk Command component).
// jsdom does not provide scrollIntoView, so we need to polyfill it for tests.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {
    // no-op
  };
}

// Polyfill localStorage for jsdom environments that lack it.
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.getItem !== "function") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage;
}

beforeEach(() => {
  globalThis.localStorage.clear();
});
