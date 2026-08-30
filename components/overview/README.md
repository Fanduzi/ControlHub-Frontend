# components/overview

Overview posture and attention queue.

`computeMetrics` pending count reuses `isActionableAttention`, the same
predicate as the attention queue.

Props are already environment-scoped by the server route, so this client
component does not filter them again.

The queue shows the first 10 actionable resources by default. Its localized
View all button expands the same `isActionableAttention` union in place; it
does not navigate or issue another resource request.

Attention reasons prefer status-specific copy. When a future or less common
status lacks that copy, the shared diagnostic field and status translations
produce a readable localized fallback instead of exposing an i18n key.

During provisioning and decommissioning, an unknown health value is the normal
pre-observation state and is omitted from the row. Warning and critical health
badges remain visible alongside the lifecycle badge.
