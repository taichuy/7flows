---
name: backend-testing
description: 用于为 7Flows 的 `api/` 改动补测试、审查后端测试缺口或验证 runtime / published surface 行为，优先复用现有 `api/tests`、`pytest` 和 `uv` 的组织方式。
---

# 7Flows 后端测试

## 何时使用

当用户要求以下任一工作时使用：

- 为 `api/` 下的路由、service、schema、runtime 或发布链路补测试
- 审查后端测试是否覆盖了真实行为风险
- 验证 runtime、published surface、plugin compat、credential、waiting / resume 等后端改动

不要用于：

- `web/` 前端测试
- 纯代码审查但不涉及测试设计或验证

## 先确认仓库现状

当前后端测试基线已经存在：

- 测试目录在 `api/tests/`
- 统一入口优先使用 `api/.venv/Scripts/uv.exe run pytest -q`
- FastAPI 路由测试主要复用 `tests/conftest.py` 里的 `TestClient` 和 sqlite fixture
- runtime、published surface、plugin runtime、credential、callback ticket 等主链已有测试文件可继续扩展

当前也有已知现实：

- 后端全量 `pytest` 是稳定基线，应优先维持
- 全仓 `ruff check` 仍有历史债务，除非本轮明确要清债，否则不要假装它已经全绿

## 测试原则

- 优先验证行为和事实层，不只验证“函数被调用了”
- 优先覆盖 `runs / node_runs / run_events / published invocations` 等真实追溯结果
- 优先围绕 `7Flows IR`、RuntimeService 单一主控、显式授权和 published surface 映射设计测试
- 不要把外部生态协议对象直接当作内部主模型来测

## 推荐顺序

1. schema / validator / helper 的纯行为测试
2. service 层测试
3. route contract 测试
4. runtime 执行链集成测试
5. published surface / async / SSE / cache / callback 等跨层测试

## 7Flows 重点测试场景

- workflow definition 校验是否仍坚持 `7Flows IR` 和显式边界
- `RuntimeService` 是否保持唯一 orchestration owner
- run、node run、run events、artifact / evidence 是否按事实层落库和暴露
- waiting / resume / callback ticket 是否沿同一条 durable runtime 主链工作
- credential、plugin compat、tool gateway 是否保持授权和执行边界
- `sandbox_code`、高风险 `tool/plugin` 或显式要求强隔离的路径，是否在没有兼容且健康的 sandbox backend 时诚实地 blocked / unavailable，而不是静默回退到宿主轻执行
- sandbox backend capability、compat adapter capability 与 execution fallback trace 是否各自沿正确主链暴露，而不是把“生态桥接”和“隔离执行”测成同一层能力
- native / OpenAI / Anthropic published surface 是否只做发布映射，而不是分叉第二条执行链

## 验证要求

至少执行：

```powershell
api/.venv/Scripts/uv.exe run pytest -q
```

如果本轮只改了局部能力，建议先跑对应测试文件，再跑全量 pytest。

如果本轮涉及导入整理、风格或明显的 lint 风险，额外执行：

```powershell
api/.venv/Scripts/uv.exe run ruff check <changed-files>
```

如果选择跑全量 `ruff check`，要明确区分：

- 本轮新增问题
- 仓库既有历史债务

## 输出要求

- 说明新增或修改了哪些测试
- 说明执行了哪些验证命令
- 如果没有补测试，要明确测试缺口和原因
- 如果受历史基线阻塞，不能笼统说“测试都通过了”
