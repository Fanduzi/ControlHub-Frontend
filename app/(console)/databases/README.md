# databases

Authenticated database inventory route. The page resolves the optional
environment slug before fetching resources or posture totals and fails closed
to an empty result for an unknown scope. Its normalized URL pagination and
search parameters are forwarded to the server-side database list contract;
the returned page metadata drives the shared pagination controls.
