# 工作表 session 拥有跑查询、模板和翻页

查询工作台的工作表状态曾经堆在 editor shell 里。我们把它收成 `WorksheetSession`：命令进去，snapshot 出来。加载带参数的已保存语句才进入模板模式；改 SQL 或换查询目标退出。Run/翻页在模板模式走模板执行口，否则走普通执行口。持久化草稿走 `hydrate` / `persistedSnapshot`，32 张上限在 session 里。schema catalog 仍是独立的，shell 只负责画、存 OCC、导出 CSV。
