/**
 * Clipboard utility for copying text to the system clipboard. Separated from
 * UI components so it can be cleanly mocked in tests without relying on
 * navigator property descriptor behavior.
 *
 * Returns true on success, false when the Clipboard API is unavailable or
 * rejects (e.g. insecure context, user-denied permission). Never throws.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
