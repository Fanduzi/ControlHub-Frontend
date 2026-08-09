// input: none (zero-dependency constants shared by server modules and middleware)
// output: Operator Session cookie name and fixed eight-hour maximum age constants
// pos: shared session contract constants for the Console BFF boundary
// note: if this file changes, update header and lib/operator-session/README.md

export const SESSION_COOKIE_NAME = "controlhub.operator-session";

export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
