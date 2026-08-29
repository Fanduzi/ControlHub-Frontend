# app/login

Public interactive login page for the Console BFF boundary.

Posts credentials to same-origin `/api/operator-session`. The authenticated
identity and role remain in the HttpOnly server session and are read through
the same-origin BFF session endpoint; the page does not persist browser role
state. Never stores or accepts a Backend Bearer Credential. Required and
malformed-email validation messages are localized through the `login` message
namespace.
