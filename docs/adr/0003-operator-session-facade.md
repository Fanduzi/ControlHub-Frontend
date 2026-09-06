# Operator Session 收成一个 facade

登录、登出、身份读取、页面守卫、proxy 鉴权曾经各自拼 config / origin / unseal / cookie。我们做一个 facade：`login`、`logout`、`readIdentity`、`authenticateCookie`、`gatePage`。HTTP 路由只做 adapter。登录把 email/displayName 封进 cookie 并返回身份、不返回凭证。页面守卫把受保护路径和 query 留在登录回跳里。缺、坏、过期的 cookie 都是同一个 401。
