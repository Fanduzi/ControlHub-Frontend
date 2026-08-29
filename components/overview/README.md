# components/overview

Overview posture and attention queue.

`computeMetrics` pending count reuses `isActionableAttention`, the same
predicate as the attention queue.

Props are already environment-scoped by the server route, so this client
component does not filter them again.
