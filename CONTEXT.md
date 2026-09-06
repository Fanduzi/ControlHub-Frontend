# ControlHub

统一资源控制台。这里只收领域用词，不写实现。

## 查询工作台

**查询目标**:
工作台里选中的、可对其发受治理查询的数据库实例或集群。
_Avoid_: resource（当目标讲时）, connection

**工作表**:
查询工作台里一张可切换的编辑页，有自己的 SQL、结果和查询目标。
_Avoid_: tab, session（当这张编辑页讲时）

**模板模式**:
工作表加载了带参数声明的已保存语句之后，Run 和翻页走模板执行，直到 SQL 被改写或换查询目标。
_Avoid_: 用 parameters.length 在界面里猜模式

**库身份**:
一次 schema 读取所针对的查询目标 + 数据库。对象树可以同时展开多把库身份。
_Avoid_: 把工作表当前选中的库当成全局唯一身份; 用 Schema Metadata Identity 当模块名

**当前库身份**:
工作表此刻用来做 SQL 补全的那一把库身份。
_Avoid_: 当前库（漏掉查询目标，换目标时会串）

**schema catalog**:
按库身份保存数据库列表、对象列表和表结构，并供给 SQL 补全用的那份目录。对象树、工作表、Cmd+P 都问它。
_Avoid_: QuerySchemaStore, schema adapter

**Operator Session**:
控制台浏览器持有的密封操作员会话。后端 Bearer 只存在服务端，不进浏览器。
_Avoid_: token, JWT（当这段会话讲时）

**结果披露**:
后端决定的单元格展示与复制策略。成功结果里不得出现 blocked 列。
_Avoid_: masking（当披露策略讲时）
