# 规则目录 — 数据库架构设计

## 范围
- 涵盖：模型/基类继承、模型属性中的架构边界、多租户感知架构设计、索引冗余检查、模型中的方言可移植性以及迁移中的跨数据库兼容性。
- 不涵盖：会话生命周期、事务边界和查询执行模式（由 `sqlalchemy-rule.md` 处理）。

## 规则

### 不要在 `@property` 内部查询其他表
- 类别：[可维护性, 性能]
- 严重性：关键
- 描述：模型 `@property` 不得打开会话或查询其他表。这隐藏了跨模型的依赖关系，将架构对象与数据访问紧密耦合，并且在迭代集合时可能导致 N+1 查询爆炸。
- 建议的修复：
  - 保持模型属性纯净且局限于已加载的字段。
  - 将跨表数据获取移动到服务/存储库方法。
  - 对于列表/批量读取，在呈现派生值之前显式获取所需的相关数据（联接/预加载/批量查询）。
- 示例：
  - 错误：
    ```python
    class Conversation(TypeBase):
        __tablename__ = "conversations"

        @property
        def app_name(self) -> str:
            with Session(db.engine, expire_on_commit=False) as session:
                app = session.execute(select(App).where(App.id == self.app_id)).scalar_one()
                return app.name
    ```
  - 正确：
    ```python
    class Conversation(TypeBase):
        __tablename__ = "conversations"

        @property
        def display_title(self) -> str:
            return self.name or "Untitled"


    # Service/repository layer performs explicit batch fetch for related App rows.
    # 服务/存储库层对相关的 App 行执行显式批量获取。
    ```

### 倾向于在模型定义中包含 `tenant_id`
- 类别：可维护性
- 严重性：建议
- 描述：在多租户领域中，只要实体属于租户拥有的数据，就在架构定义中包含 `tenant_id`。这提高了数据隔离的安全性，并随着数据量的增长保持未来的分区/分片策略切实可行。
- 建议的修复：
  - 添加 `tenant_id` 列，并确保相关的唯一/索引约束在适用的情况下包含租户维度。
  - 通过服务/存储库契约传播 `tenant_id`，以保持访问路径具有租户感知能力。
  - 例外：如果表被明确设计为非租户范围的全局元数据，请清楚地记录该设计决策。
- 示例：
  - 错误：
    ```python
    from sqlalchemy.orm import Mapped

    class Dataset(TypeBase):
        __tablename__ = "datasets"
        id: Mapped[str] = mapped_column(StringUUID, primary_key=True)
        name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    ```
  - 正确：
    ```python
    from sqlalchemy.orm import Mapped

    class Dataset(TypeBase):
        __tablename__ = "datasets"
        id: Mapped[str] = mapped_column(StringUUID, primary_key=True)
        tenant_id: Mapped[str] = mapped_column(StringUUID, nullable=False, index=True)
        name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    ```

### 检测并避免重复/冗余索引
- 类别：性能
- 严重性：建议
- 描述：审查索引定义是否存在最左前缀冗余。例如，索引 `(a, b, c)` 可以安全地覆盖 `(a, b)` 的大多数查找。保留两者可能会增加写入开销，并可能误导优化器进入次优执行计划。
- 建议的修复：
  - 在添加索引之前，根据最左前缀规则与现有的复合索引进行比较。
  - 除非有经过验证的查询模式需求，否则删除或避免创建冗余前缀。
  - 在模型 `__table_args__` 和迁移索引 DDL 中应用相同的审查标准。
- 示例：
  - 错误：
    ```python
    __table_args__ = (
        sa.Index("idx_msg_tenant_app", "tenant_id", "app_id"),
        sa.Index("idx_msg_tenant_app_created", "tenant_id", "app_id", "created_at"),
    )
    ```
  - 正确：
    ```python
    __table_args__ = (
        # Keep the wider index unless profiling proves a dedicated short index is needed.
        # 除非性能分析证明需要专用的短索引，否则保留较宽的索引。
        sa.Index("idx_msg_tenant_app_created", "tenant_id", "app_id", "created_at"),
    )
    ```

### 避免在模型中使用仅限 PostgreSQL 的方言；包装在 `models.types` 中
- 类别：可维护性
- 严重性：关键
- 描述：模型/架构定义应避免在业务模型中直接使用仅限 PostgreSQL 的构造。当需要特定于数据库的行为时，请使用 PostgreSQL 和 MySQL 方言实现将其封装在 `api/models/types.py` 中，然后从模型代码中使用该抽象。
- 建议的修复：
  - 当可以使用可移植包装器时，不要在模型列中直接放置仅限方言的类型/运算符。
  - 在 `models.types` 中添加或扩展包装器（例如 `AdjustedJSON`、`LongText`、`BinaryData`），以标准化 PostgreSQL 和 MySQL 之间的行为。
- 示例：
  - 错误：
    ```python
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.orm import Mapped

    class ToolConfig(TypeBase):
        __tablename__ = "tool_configs"
        config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    ```
  - 正确：
    ```python
    from sqlalchemy.orm import Mapped

    from models.types import AdjustedJSON

    class ToolConfig(TypeBase):
        __tablename__ = "tool_configs"
        config: Mapped[dict] = mapped_column(AdjustedJSON(), nullable=False)
    ```

### 使用方言检查和共享类型保护迁移不兼容性
- 类别：可维护性
- 严重性：关键
- 描述：`api/migrations/versions/` 下的迁移脚本必须明确说明 PostgreSQL/MySQL 的不兼容性。对于对言敏感的 DDL 或默认值，请在活动方言上进行分支（例如，`conn.dialect.name == "postgresql"`），并在适用的情况下优先使用来自 `models.types` 的可重用兼容性抽象。
- 建议的修复：
  - 在迁移升级/降级中，绑定连接并根据方言分支不兼容的 SQL 片段。
  - 在列定义中重用 `models.types` 包装器，当这能保持行为与运行时模型一致时。
  - 除非有记录在案的、故意的兼容性例外，否则避免仅限一种方言的迁移逻辑。
- 示例：
  - 错误：
    ```python
    with op.batch_alter_table("dataset_keyword_tables") as batch_op:
        batch_op.add_column(
            sa.Column(
                "data_source_type",
                sa.String(255),
                server_default=sa.text("'database'::character varying"),
                nullable=False,
            )
        )
    ```
  - 正确：
    ```python
    def _is_pg(conn) -> bool:
        return conn.dialect.name == "postgresql"


    conn = op.get_bind()
    default_expr = sa.text("'database'::character varying") if _is_pg(conn) else sa.text("'database'")

    with op.batch_alter_table("dataset_keyword_tables") as batch_op:
        batch_op.add_column(
            sa.Column("data_source_type", sa.String(255), server_default=default_expr, nullable=False)
        )
    ```
