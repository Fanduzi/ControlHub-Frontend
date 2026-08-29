# components/overview

Overview posture and attention queue.

`computeMetrics` pending count reuses `isActionableAttention`, the same
predicate as the attention queue.

Props are already environment-scoped by the server route, so this client
component does not filter them again.

The queue shows the first 10 actionable resources by default. Its localized
View all button expands the same `isActionableAttention` union in place; it
does not navigate or issue another resource request.
