# app/login

Public interactive login page for the Console BFF boundary.

Posts credentials to same-origin `/api/operator-session`. Stores only the
presentation `controlhub.role` (sessionStorage + cookie). Never stores or
accepts a Backend Bearer Credential. Required and malformed-email validation
messages are localized through the `login` message namespace.
