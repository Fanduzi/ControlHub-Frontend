# overview

Authenticated environment posture route. The page uses an explicit URL
environment when present, including `environment=all`; otherwise it reads the
persisted environment cookie. Unknown slugs fail closed to empty data.
