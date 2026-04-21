/** Shared severity color classes for health, lifecycle, and audit result indicators. */

export const HEALTH_COLORS: Record<
  string,
  { bg: string; text: string; textDark: string }
> = {
  healthy: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700",
    textDark: "dark:text-emerald-300",
  },
  warning: {
    bg: "bg-amber-500/10",
    text: "text-amber-700",
    textDark: "dark:text-amber-300",
  },
  critical: {
    bg: "bg-rose-500/10",
    text: "text-rose-700",
    textDark: "dark:text-rose-300",
  },
  degraded: {
    bg: "bg-orange-500/10",
    text: "text-orange-700",
    textDark: "dark:text-orange-300",
  },
};

export const HEALTH_BORDER: Record<string, string> = {
  critical: "border-l-2 border-l-rose-500",
  degraded: "border-l-2 border-l-rose-500",
  warning: "border-l-2 border-l-amber-500",
  pending: "border-l-2 border-l-sky-500",
};

export const HEALTH_METRIC_TEXT: Record<string, string> = {
  degraded: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
  pending: "text-sky-600 dark:text-sky-400",
};

export const AUDIT_RESULT_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

export const AUDIT_RESULT_BORDER: Record<string, string> = {
  error: "border-l-2 border-l-rose-500",
  warning: "border-l-2 border-l-amber-500",
};

export const POSTURE_BAR_COLORS: Record<string, string> = {
  degraded: "bg-rose-500",
  warning: "bg-amber-500",
  pending: "bg-sky-500",
};
