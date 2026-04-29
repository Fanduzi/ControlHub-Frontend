export type DiagnosticStatusField = "healthStatus" | "lifecycleStatus";
export type MissingDataKind = "role" | "profile" | "connection" | "audit";

export function buildStatusReasonKey(
  field: DiagnosticStatusField,
  value: string,
) {
  return {
    fieldKey: `diagnostics.fields.${field}`,
    valueKey: `statusValues.${value}`,
    fallbackKey: `diagnostics.reasons.${field}.${value}`,
  };
}

export function buildStatusReasonSentenceKey(
  field: DiagnosticStatusField,
  value: string,
) {
  return `diagnostics.sentences.${field}.${value}`;
}

export function buildMissingDataKey(kind: MissingDataKind) {
  return `diagnostics.missing.${kind}`;
}
