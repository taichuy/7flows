# 规则目录 — 架构

## 范围
- 涵盖：控制器/服务/核心领域/库/模型分层、依赖方向、职责分配、对可观测性友好的流程。

## 规则

### 将业务逻辑保持在控制器之外
- 类别：可维护性
- 严重性：关键
- 描述：控制器应该解析输入，调用服务，并返回序列化的响应。控制器内部的业务决策使得行为难以重用和测试。
- 建议的修复：将领域/业务逻辑移动到服务或核心/领域层。保持控制器处理程序简薄并专注于编排。
- 示例：
  - 错误：
    ```python
    @bp.post("/apps/<app_id>/publish")
    def publish_app(app_id: str):
        payload = request.get_json() or {}
        if payload.get("force") and current_user.role != "admin":
            raise ValueError("only admin can force publish")
        app = App.query.get(app_id)
        app.status = "published"
        db.session.commit()
        return {"result": "ok"}
    ```
  - 正确：
    ```python
    @bp.post("/apps/<app_id>/publish")
    def publish_app(app_id: str):
        payload = PublishRequest.model_validate(request.get_json() or {})
        app_service.publish_app(app_id=app_id, force=payload.force, actor_id=current_user.id)
        return {"result": "ok"}
    ```

### 保持层依赖方向
- 类别：最佳实践
- 严重性：关键
- 描述：控制器可以依赖于服务，服务可以依赖于核心/领域抽象。反转此方向（例如，核心导入控制器/Web 模块）会创建循环并将传输关注点泄漏到领域代码中。
- 建议的修复：将共享契约提取到核心/领域或服务级模块中，并使上层依赖于下层，而不是相反。
- 示例：
  - 错误：
    ```python
    # core/policy/publish_policy.py
    from controllers.console.app import request_context

    def can_publish() -> bool:
        return request_context.current_user.is_admin
    ```
  - 正确：
    ```python
    # core/policy/publish_policy.py
    def can_publish(role: str) -> bool:
        return role == "admin"

    # service layer adapts web/user context to domain input
    # 服务层将 web/用户上下文适配为领域输入
    allowed = can_publish(role=current_user.role)
    ```

### 保持库与业务无关
- 类别：可维护性
- 严重性：关键
- 描述：`api/libs/` 下的模块应保持为可重用的、与业务无关的构建块。它们不得编码特定于产品/领域的规则、工作流编排或业务决策。
- 建议的修复：
  - 如果业务逻辑出现在 `api/libs/` 中，请将其提取到适当的 `services/` 或 `core/` 模块中，并使 `libs` 专注于通用的、横切的辅助程序。
  - 保持 `libs` 依赖关系清晰：避免将特定于服务/控制器/领域的模块导入 `api/libs/`。
- 示例：
  - 错误：
    ```python
    # api/libs/conversation_filter.py
    from services.conversation_service import ConversationService

    def should_archive_conversation(conversation, tenant_id: str) -> bool:
        # Domain policy and service dependency are leaking into libs.
        # 领域策略和服务依赖泄漏到了 libs 中。
        service = ConversationService()
        if service.has_paid_plan(tenant_id):
            return conversation.idle_days > 90
        return conversation.idle_days > 30
    ```
  - 正确：
    ```python
    # api/libs/datetime_utils.py (business-agnostic helper)
    # api/libs/datetime_utils.py (与业务无关的辅助程序)
    def older_than_days(idle_days: int, threshold_days: int) -> bool:
        return idle_days > threshold_days

    # services/conversation_service.py (business logic stays in service/core)
    # services/conversation_service.py (业务逻辑保留在 service/core 中)
    from libs.datetime_utils import older_than_days

    def should_archive_conversation(conversation, tenant_id: str) -> bool:
        threshold_days = 90 if has_paid_plan(tenant_id) else 30
        return older_than_days(conversation.idle_days, threshold_days)
    ```
