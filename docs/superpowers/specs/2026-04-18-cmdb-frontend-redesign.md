# CMDB Frontend Redesign

**Date:** 2026-04-18
**Status:** Draft
**Scope:** Frontend UX/UI overhaul + targeted backend API extensions

## Background

ControlHub 是一个基础设施 CMDB 管理工具，当前前端存在以下核心问题：

1. Resources 和 CMDB 两个页面重叠，用户困惑
2. 数据库资源缺少类型图标（MySQL 海豚等）
3. 数据库集群详情页缺少成员实例列表（主机名、端口、组件类型）
4. 关系列表显示 UUID 而非可读名称
5. 多处暗色主题适配缺陷、交互一致性问题

基于用户公司 CMDB 截图的优秀实践，以及 UX Architect 和 UI Designer 的全面审计，制定本设计方案。

## Design Decisions

### D1: 合并 Resources + CMDB 为单一页面

**决策**: 删除 `/cmdb` 页面，将其独有信息（externalId、source、labels 详情）作为 Resources 表的可切换列。

**理由**: 两个页面操作相同数据集，用户认知负担高。通过列选择器（shadcn DropdownMenu + CheckboxItem）让用户自定义视图，比维护两个页面更清晰。

**实现**: 保留 `/resources` 作为唯一资源列表入口。在表头右侧添加"自定义列"按钮。CMDB 的导航入口移除。

### D2: 数据库资源加上下文列

**决策**: Resources 表中，database_instance 行显示 hostname、IP、port；database_cluster 行显示节点数、引擎类型。

**理由**: 运维人员最高频的查询是"这个实例连哪里"和"这个集群有几个节点"，这些信息不应藏在 profile 详情页里。

**实现**: 后端 `GET /resources` 响应新增可选的 `profileSummary` 字段（只含该类型最常用的 2-3 个字段）。前端根据 resourceType 条件渲染这些列，空值显示短横线（不隐藏列，避免表格跳动）。

### D3: 数据库类型图标

**决策**: 在 displayName 列左侧新增 24x24 图标列，使用官方 SVG logo。

**覆盖类型**: MySQL（海豚）、PostgreSQL（大象）、Redis（方块）、MongoDB（叶子）、TiDB、ProxySQL。未匹配的子类型显示通用数据库图标。

**来源**: 从各数据库官方品牌页获取 SVG，存放在 `public/icons/db/` 目录。

### D4: 集群详情页加实例表格

**决策**: 在数据库集群的资源详情页顶部，始终可见地展示"集群成员"表格，列为：组件类型、主机名、端口、健康状态。行可点击跳转实例详情。

**理由**: 这是集群资源页面最重要的信息，不应藏在拓扑图中。参考用户公司 CMDB 的实例 Tab（Component、Hostname、Port）。

**实现**: 数据来自现有 `member_of` 关系 + 实例的 profileSummary。前端在集群详情页加载时，通过集群的关联资源接口获取成员实例列表。后端需要新增或扩展一个接口，返回集群成员及其基本信息。

### D5: 关系列表用名称替代 UUID

**决策**: 关系列表每项显示"资源名称 (资源类型)"，可点击跳转。UUID 只在 hover tooltip 和复制按钮中显示。

**实现**: 后端 `GET /resources/{id}/relations` 返回的每条关系需包含关联资源的 `name`、`displayName`、`resourceType`。前端替换当前直接渲染 UUID 的逻辑。

### D6: 搜索加 debounce

**决策**: 所有搜索输入框添加 300ms debounce。本地 `searchDraft` 状态即时更新（保持输入流畅），但 URL 参数替换延迟执行。

**影响文件**: resource-table.tsx、cmdb-table.tsx（合并后删除）、database-table.tsx

### D7: 暗色主题修复

**决策**: 修复以下暗色主题缺陷：

| 组件 | 问题 | 修复方案 |
|------|------|----------|
| ApiError | 硬编码 rose-50/900 亮色 | 改用 `bg-destructive/5 text-destructive` |
| 概览指标 | rose-700/amber-700 对比度不足 | 加 `dark:` 变体，使用更亮色阶如 rose-400 |
| 审计链接 | hover:text-sky-700 暗色不可见 | 移除，用 `hover:text-primary` |
| StatusBadge | degraded/unknown fallback 蓝色 | 加 degraded(橙色) 和 unknown(灰色) 配色 |
| 边框 | oklch(1 0 0 / 12%) 太淡 | 提升到 14-16% |

### D8: 表格行键盘可访问性

**决策**: 所有表格可点击行的首列（资源名称）改为 `<Link>` 或 `<button>`，行本身不做交互元素。添加 `focus-visible` 样式。

**理由**: 当前 `<tr>` 没有 tabIndex/role/onKeyDown，违反 WCAG 2.1 Level A (2.1.1 Keyboard)。

### D9: 添加关系改为资源搜索选择器

**决策**: 替换手动 UUID 输入为带搜索功能的 Combobox，支持按 displayName 搜索并选择资源。

**实现**: 使用 shadcn Command 组件（基于 cmdk），输入时调用 `GET /resources?q=xxx` 搜索，展示结果列表供选择。

### D10: Labels 编辑改为键值对编辑器

**决策**: 替换 JSON textarea 为可视化键值对编辑器（每行一组 key-value input，支持增删行）。

**理由**: 要求运维人员手写 `{"team": "order"}` 格式不合理。

## Backend API Changes

以下改动**不改存储模型、不改表结构**，只在 API 响应层扩展。

### B1: Resource List API 扩展

**Endpoint**: `GET /resources`
**改动**: 响应中每条资源新增 `profileSummary` 字段。

```json
{
  "id": "...",
  "displayName": "Order DB Primary",
  "resourceType": "database_instance",
  "profileSummary": {
    "hostname": "db-order-01.prod",
    "ip": "10.0.1.50",
    "port": 3306
  }
}
```

对于 database_cluster：
```json
{
  "profileSummary": {
    "nodeCount": 3,
    "engine": "mysql"
  }
}
```

对于非数据库资源，`profileSummary` 为 `null` 或省略。

### B2: Relations API 扩展

**Endpoint**: `GET /resources/{id}/relations`
**改动**: 每条关系新增 `relatedResource` 对象。

```json
{
  "id": "rel-uuid",
  "fromResourceId": "...",
  "toResourceId": "...",
  "relationType": "member_of",
  "relatedResource": {
    "id": "...",
    "displayName": "Order DB Primary",
    "resourceType": "database_instance",
    "healthStatus": "healthy"
  }
}
```

### B3: Cluster Members API（新增或扩展）

**方案 A（推荐）**: 扩展 `GET /resources/{id}` 的 detail 响应，为 database_cluster 类型自动聚合成员列表。

**方案 B**: 新增 `GET /resources/{id}/members` endpoint。

返回结构：
```json
{
  "members": [
    {
      "id": "...",
      "displayName": "Order DB Primary",
      "resourceSubtype": "mysql",
      "profileSummary": { "hostname": "db-order-01", "port": 3306 },
      "healthStatus": "healthy",
      "lifecycleStatus": "running"
    }
  ]
}
```

数据来源：通过 `member_of` 关系查询成员实例，再关联其 profile。

## P0 Issues (Must Fix)

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | 搜索无 debounce | resource-table.tsx:293, database-table.tsx:160 | 加 300ms debounce |
| 2 | ApiError 暗色不适配 | api-error.tsx:24 | 改用 design token |
| 3 | 概览指标对比度不足 | overview-content.tsx:151 | 加 dark: 变体 |
| 4 | 审计链接 hover 不可见 | audit-table.tsx:113 | 移除硬编码色 |
| 5 | StatusBadge 缺 degraded/unknown | status-badge.tsx:14 | 加专属配色 |
| 6 | 表格行无键盘聚焦 | 所有表格 TableRow | 首列改 Link + focus-visible |
| 7 | 添加关系需手输 UUID | resource-relation-panel.tsx:133 | 改为 Combobox |

## P1 Issues (Should Fix)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Resources + CMDB 合并 | 删 /cmdb，加列选择器 |
| 2 | 关系列表显示 UUID | 后端 B2 + 前端改渲染 |
| 3 | 数据库表格缺 hostname/IP/port | 后端 B1 + 前端加列 |
| 4 | 集群详情缺实例表格 | 后端 B3 + 前端加 section |
| 5 | 数据库类型图标 | 加 SVG logo + 图标列 |
| 6 | Labels 手写 JSON | 改为键值对编辑器 |
| 7 | 加载骨架屏不统一 | DataTableShell 加 loading prop |
| 8 | EmptyState 缺 CTA | 扩展 props 加 icon/action |
| 9 | Topbar Quick Action 无功能 | 绑定到 CreateResourceSheet |
| 10 | Sheet 和详情页 section 顺序不一致 | 统一排列顺序 |

## P2 Issues (Nice to Have)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Command Palette (Cmd+K) | 集成 cmdk |
| 2 | 概览页趋势和分布图 | 加图表组件 |
| 3 | 批量操作 | 表格加 checkbox 列 |
| 4 | 相对时间显示 | 24h 内显示"X 小时前" |
| 5 | 面包屑导航 | 详情页加 breadcrumb |
| 6 | 表格列宽显式定义 | columnDef 加 size |
| 7 | 暗色边框可见度 | oklch 12% -> 14-16% |

## Out of Scope

- 后端存储模型变更（不改表结构、不加新表）
- 用户认证/权限系统改动
- 国际化新增语言
- 通知/Webhook 集成
- 资源拓扑图导出
- CSV 批量导入
