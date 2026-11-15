# Hooks

Shared React lifecycle hooks.

## Members

| File | Responsibility |
|---|---|
| `use-debounce.ts` | Returns a stable delayed callback, replacing pending calls and cancelling pending work when its owner unmounts or when `cancel()` is invoked (e.g. a Clear filters action racing a pending keystroke) |

## Interfaces

- `useDebounceCallback(callback, delay)` invokes only the latest scheduled call after `delay` milliseconds while the owner remains mounted.

## Dependencies

- Upstream: client components that debounce user input
- Downstream: React callback, effect, and ref primitives
