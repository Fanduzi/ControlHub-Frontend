// input: none (zero-dependency constants shared by server modules and the route proxy)
// output: Operator Session cookie name, legacy seam cookie name, and session age/rotation constants
// pos: shared session contract constants for the Console BFF boundary
// note: if this file changes, update header and lib/operator-session/README.md

export const SESSION_COOKIE_NAME = "controlhub.operator-session";

/**
 * Legacy seam cookie set by the pre-BFF login flow; accepted by the route
 * proxy only until the Phase 38X console migration (#15) removes it.
 */
export const LEGACY_TOKEN_COOKIE_NAME = "controlhub.token";

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * Short previous-key rotation window: after a key rotation, seals made with
 * the previous key are accepted only when issued within this window. Older
 * previous-key sessions require interactive login again.
 */
export const SESSION_PREVIOUS_KEY_WINDOW_SECONDS = 15 * 60;
