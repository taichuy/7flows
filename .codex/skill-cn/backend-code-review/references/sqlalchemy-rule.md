# 规则目录 — SQLAlchemy 模式

## 范围
- 涵盖：SQLAlchemy 会话和事务生命周期、查询构建、租户范围、原生 SQL 边界和写入路径并发保障。
- 不涵盖：表/模型架构和迁移设计细节（由 `db-schema-rule.md` 处理）。

## 规则

### 使用具有显式事务控制行为的会话上下文管理器
- 类别：最佳实践
- 严重性：关键
- 描述：会话和事务生命周期在写入路径上必须是显式和有界的。丢失提交可能会静默地丢弃预期的更新，而临时或长寿命的事务会增加争用、锁定持续时间和死锁风险。
- 建议的修复：
  - 在完成相关的写入单元后使用 **显式 `session.commit()`**。
  - 或者使用 **`session.begin()` 上下文管理器** 在作用域块上自动提交/回滚。
  - 保持事务窗口简短：避免在事务内进行网络 I/O、繁重计算或不相关的工作。
- 示例：
  - 错误：
    ```python
    # Missing commit: write may never be persisted.
    # 缺少提交：写入可能永远不会被持久化。
    with Session(db.engine, expire_on_commit=False) as session:
        run = session.get(WorkflowRun, run_id)
        run.status = "cancelled"

    # Long transaction: external I/O inside a DB transaction.
    # 长事务：数据库事务内部的外部 I/O。
    with Session(db.engine, expire_on_commit=False) as session, session.begin():
        run = session.get(WorkflowRun, run_id)
        run.status = "cancelled"
        call_external_api()
    ```
  - 正确：
    ```python
    # Option 1: explicit commit.
    # 选项 1：显式提交。
    with Session(db.engine, expire_on_commit=False) as session:
        run = session.get(WorkflowRun, run_id)
        run.status = "cancelled"
        session.commit()

    # Option 2: scoped transaction with automatic commit/rollback.
    # 选项 2：具有自动提交/回滚的作用域事务。
    with Session(db.engine, expire_on_commit=False) as session, session.begin():
        run = session.get(WorkflowRun, run_id)
        run.status = "cancelled"

    # Keep non-DB work outside transaction scope.
    # 将非数据库工作保持在事务范围之外。
    call_external_api()
    ```

### 强制对共享资源查询进行 tenant_id 范围限定
- 类别：安全
- 严重性：关键
- 描述：针对共享表的读取和写入必须由 `tenant_id` 限定范围，以防止跨租户数据泄漏或损坏。
- 建议的修复：向所有租户拥有的实体查询添加 `tenant_id` 谓词，并通过服务/存储库接口传播租户上下文。
- 示例：
  - 错误：
    ```python
    stmt = select(Workflow).where(Workflow.id == workflow_id)
    workflow = session.execute(stmt).scalar_one_or_none()
    ```
  - 正确：
    ```python
    stmt = select(Workflow).where(
        Workflow.id == workflow_id,
        Workflow.tenant_id == tenant_id,
    )
    workflow = session.execute(stmt).scalar_one_or_none()
    ```

### 默认情况下倾向于 SQLAlchemy 表达式而不是原生 SQL
- 类别：可维护性
- 严重性：建议
- 描述：原生 SQL 应该是例外的。ORM/Core 表达式更容易演进，组合更安全，并且与代码库更一致。
- 建议的修复：将简单的原生 SQL 重写为 SQLAlchemy `select/update/delete` 表达式；仅当明确的技术约束需要时才保留原生 SQL。
- 示例：
  - 错误：
    ```python
    row = session.execute(
        text("SELECT * FROM workflows WHERE id = :id AND tenant_id = :tenant_id"),
        {"id": workflow_id, "tenant_id": tenant_id},
    ).first()
    ```
  - 正确：
    ```python
    stmt = select(Workflow).where(
        Workflow.id == workflow_id,
        Workflow.tenant_id == tenant_id,
    )
    row = session.execute(stmt).scalar_one_or_none()
    ```

### 使用并发保障保护写入路径
- 类别：质量
- 严重性：关键
- 描述：没有显式并发控制的多写入者路径可能会静默覆盖数据。根据争用级别、锁定范围和吞吐量成本选择保障措施，而不是默认使用一种策略。
- 建议的修复：
  - **乐观锁定**：当争用通常较低且重试可接受时使用。在 `WHERE` 中添加版本（或 updated_at）防护，并将 `rowcount == 0` 视为冲突。
  - **Redis 分布式锁**：当临界区跨越多个步骤/进程（或包括非数据库副作用）并且需要跨工作者互斥时使用。
  - **SELECT ... FOR UPDATE**：当同一行上的争用很高且需要严格的事务内序列化时使用。保持事务简短以减少锁定等待/死锁风险。
  - 在所有情况下，按 `tenant_id` 限定范围，并验证受影响的行数以进行条件写入。
- 示例：
  - 错误：
    ```python
    # No tenant scope, no conflict detection, and no lock on a contested write path.
    # 没有租户范围，没有冲突检测，并且在争用的写入路径上没有锁。
    session.execute(update(WorkflowRun).where(WorkflowRun.id == run_id).values(status="cancelled"))
    session.commit()  # silently overwrites concurrent updates (静默覆盖并发更新)
    ```
  - 正确：
    ```python
    # 1) Optimistic lock (low contention, retry on conflict)
    # 1) 乐观锁定（低争用，冲突时重试）
    result = session.execute(
        update(WorkflowRun)
        .where(
            WorkflowRun.id == run_id,
            WorkflowRun.tenant_id == tenant_id,
            WorkflowRun.version == expected_version,
        )
        .values(status="cancelled", version=WorkflowRun.version + 1)
    )
    if result.rowcount == 0:
        raise WorkflowStateConflictError("stale version, retry")

    # 2) Redis distributed lock (cross-worker critical section)
    # 2) Redis 分布式锁（跨工作者临界区）
    lock_name = f"workflow_run_lock:{tenant_id}:{run_id}"
    with redis_client.lock(lock_name, timeout=20):
        session.execute(
            update(WorkflowRun)
            .where(WorkflowRun.id == run_id, WorkflowRun.tenant_id == tenant_id)
            .values(status="cancelled")
        )
        session.commit()

    # 3) Pessimistic lock with SELECT ... FOR UPDATE (high contention)
    # 3) 带有 SELECT ... FOR UPDATE 的悲观锁定（高争用）
    run = session.execute(
        select(WorkflowRun)
        .where(WorkflowRun.id == run_id, WorkflowRun.tenant_id == tenant_id)
        .with_for_update()
    ).scalar_one()
    run.status = "cancelled"
    session.commit()
    ```
