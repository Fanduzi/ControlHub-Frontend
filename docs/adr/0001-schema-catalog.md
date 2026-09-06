# schema catalog 按库身份拥有列表和表结构

查询工作台里对象树、工作表补全、Cmd+P 曾经各自拉 schema，表结构缓存还把占坑手续露在外面。我们做一个 schema catalog：按库身份缓存数据库列表、对象列表和表结构，调用方自带页码和搜索词，数据只存一份并通知订阅者。React 只负责画。测试走内存假后端，不 mock 穿 catalog。SQL 分词、工作表怎么跑查询、模板、结果披露、Operator Session 都不进这一步。

后面按顺序、不再问：工作表 session 独立、消费 catalog；Operator Session 收成一个 facade；模板进入/编码进工作表 session，列表 CRUD 仍单独；结果披露是小的纯校验，不并进 session。
