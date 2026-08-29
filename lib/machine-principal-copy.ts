// input: active application locale
// output: localized machine-principal administration copy
// pos: Small localized vocabulary shared by the route and its entry points
// note: if this file changes, update lib/README.md.
const english = {
  eyebrow: "Security administration",
  title: "Machine principals",
  description: "Issue scoped credentials for non-browser integrations.",
  restricted: "Only administrators can manage machine principals.",
  formTitle: "Issue a machine credential",
  nameLabel: "Principal name",
  namePlaceholder: "inventory-agent",
  lifetimeLabel: "Lifetime (days)",
  lifetimeHelp: "Defaults to 30 days; the maximum is 90 days.",
  scopesLabel: "Canonical scopes",
  create: "Create principal",
  creating: "Creating…",
  listTitle: "Issued principals",
  loading: "Loading machine principals…",
  empty: "No machine principals have been issued.",
  active: "Active",
  revoked: "Revoked",
  expires: "Expires",
  actions: "Actions",
  rotate: "Rotate",
  revoke: "Revoke",
  unavailable: "Credential metadata unavailable",
  secretTitle: "Copy this secret now",
  secretWarning: "This plaintext secret is shown once and will not be retained or displayed again. Store it securely before dismissing.",
  copySecret: "Copy secret",
  copied: "Copied",
  dismissSecret: "Dismiss secret",
  invalidForm: "Enter a name, select at least one scope, and use 1–90 days.",
  rotateConfirm: "Rotate this credential? The current credential will stop being usable.",
  revokeConfirm: "Revoke this credential? This cannot be undone.",
  requestFailed: "The request could not be completed.",
  noCredential: "No credential metadata was returned for this principal.",
} as const;

const chinese = {
  eyebrow: "安全管理",
  title: "机器主体",
  description: "为非浏览器集成签发受范围限制的凭证。",
  restricted: "只有管理员可以管理机器主体。",
  formTitle: "签发机器凭证",
  nameLabel: "主体名称",
  namePlaceholder: "inventory-agent",
  lifetimeLabel: "有效期（天）",
  lifetimeHelp: "默认 30 天，最长 90 天。",
  scopesLabel: "固定范围",
  create: "创建主体",
  creating: "创建中…",
  listTitle: "已签发主体",
  loading: "正在加载机器主体…",
  empty: "尚未签发机器主体。",
  active: "有效",
  revoked: "已撤销",
  expires: "到期",
  actions: "操作",
  rotate: "轮换",
  revoke: "撤销",
  unavailable: "凭证元数据不可用",
  secretTitle: "立即复制此密钥",
  secretWarning: "此明文密钥只显示一次，关闭后不会保留或再次显示。请在关闭前安全保存。",
  copySecret: "复制密钥",
  copied: "已复制",
  dismissSecret: "关闭密钥",
  invalidForm: "请输入名称，至少选择一个范围，并使用 1–90 天。",
  rotateConfirm: "轮换此凭证？当前凭证将停止使用。",
  revokeConfirm: "撤销此凭证？此操作无法撤销。",
  requestFailed: "请求无法完成。",
  noCredential: "此主体没有返回凭证元数据。",
} as const;

export type MachinePrincipalCopy = Record<keyof typeof english, string>;

export function getMachinePrincipalCopy(locale: string): MachinePrincipalCopy {
  return locale === "en" ? english : chinese;
}
