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
