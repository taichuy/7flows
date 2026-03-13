# 规则目录 — 存储库抽象

## 范围
- 涵盖：何时重用现有的存储库抽象，何时引入新的存储库，以及如何保持服务/核心与基础设施实现之间的依赖方向。
- 不涵盖：SQLAlchemy 会话生命周期和查询形状细节（由 `sqlalchemy-rule.md` 处理），以及表架构/迁移设计（由 `db-schema-rule.md` 处理）。

## 规则

### 引入存储库抽象
- 类别：可维护性
- 严重性：建议
- 描述：如果表/模型已经有存储库抽象，则该表的所有读取/写入/查询都应使用现有的存储库。如果不存在存储库，仅当复杂性合理时才引入一个，例如大/高容量表、重复的复杂查询逻辑或可能的存储策略变化。
- 建议的修复：
  - 首先检查 `api/repositories`、`api/core/repositories` 和 `api/extensions/*/repositories/`，以验证表/模型是否已有存储库抽象。如果存在，请通过它路由所有操作，并添加缺失的存储库方法，而不是使用临时 SQLAlchemy 访问绕过它。
  - 如果不存在存储库，仅当复杂性需要时（例如，重复的复杂查询、大数据域或多种存储策略）才添加一个，同时保持依赖方向（服务/核心依赖于抽象；基础设施提供实现）。
- 示例：
  - 错误：
    ```python
    # Existing repository is ignored and service uses ad-hoc table queries.
    # 现有的存储库被忽略，服务使用临时的表查询。
    class AppService:
        def archive_app(self, app_id: str, tenant_id: str) -> None:
            app = self.session.execute(
                select(App).where(App.id == app_id, App.tenant_id == tenant_id)
            ).scalar_one()
            app.archived = True
            self.session.commit()
    ```
  - 正确：
    ```python
    # Case A: Existing repository must be reused for all table operations.
    # 情况 A：现有的存储库必须被重用于所有表操作。
    class AppService:
        def archive_app(self, app_id: str, tenant_id: str) -> None:
            app = self.app_repo.get_by_id(app_id=app_id, tenant_id=tenant_id)
            app.archived = True
            self.app_repo.save(app)

    # If the query is missing, extend the existing abstraction.
    # 如果查询缺失，扩展现有的抽象。
    active_apps = self.app_repo.list_active_for_tenant(tenant_id=tenant_id)
    ```
  - 错误：
    ```python
    # No repository exists, but large-domain query logic is scattered in service code.
    # 不存在存储库，但大域查询逻辑散落在服务代码中。
    class ConversationService:
        def list_recent_for_app(self, app_id: str, tenant_id: str, limit: int) -> list[Conversation]:
            ...
            # many filters/joins/pagination variants duplicated across services
            # 许多过滤器/联接/分页变体在服务之间重复
    ```
  - 正确：
    ```python
    # Case B: Introduce repository for large/complex domains or storage variation.
    # 情况 B：为大/复杂领域或存储变化引入存储库。
    class ConversationRepository(Protocol):
        def list_recent_for_app(self, app_id: str, tenant_id: str, limit: int) -> list[Conversation]: ...

    class SqlAlchemyConversationRepository:
        def list_recent_for_app(self, app_id: str, tenant_id: str, limit: int) -> list[Conversation]:
            ...

    class ConversationService:
        def __init__(self, conversation_repo: ConversationRepository):
            self.conversation_repo = conversation_repo
    ```
