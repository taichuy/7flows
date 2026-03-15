# 2026-03-15 社区许可证与本地草稿区收口

## 背景

- 上一轮已把“对外 OpenClaw-first 切口”和“对内 7Flows IR / runtime 内核”拆开表达，但仓库里仍保留 `docs/7_flows_开源与商业双线计划书_v_1.md`、`docs/dify源码启动教程.md`、`docs/rustFS的启动文档.md` 这类本地讨论/参考材料，容易继续污染正式文档索引和 AI 默认检索上下文。
- 根目录 `LICENSE` 当时仍是 GPLv2，占位意义大于实际策略表达，已经和用户当前希望采用的“Apache 2.0 基底 + 商业保留边界”不一致。
- 用户本轮明确要求：
  - 把上述讨论/草稿文档迁到 `docs/.taichuy/` 并设置 Git 忽略
  - 让 `docs/open-source-commercial-strategy.md` 更清楚地突出社区版专注方向
  - 参考 Dify 的做法，把许可证改成更接近 Apache 2.0 的社区许可证，并写清楚多租户商业化、对立面服务和前端 UI / 品牌边界

## 目标

1. 把本地讨论草稿和正式文档事实源彻底分层，避免仓库知识面继续混入内部推导稿。
2. 把社区版的产品专注方向、商业保留边界和授权表达收敛成明确基线。
3. 让 README、策略文档、协作规范、当前事实索引和许可证文件彼此对齐，不再出现“文档说开源、许可证却还是旧文本”的断裂。

## 决策与实现

### 1. 本地草稿统一迁到 `docs/.taichuy/`

- 在 `.gitignore` 中加入 `docs/.taichuy/`。
- 在 `AGENTS.md` 和 `docs/README.md` 中补充约定：`docs/.taichuy/` 只用于本地开发设计讨论素材、外部参考启动文档和传播文案草稿，不作为默认事实来源。
- 将以下文件移出正式文档索引，迁到本地忽略目录：
  - `docs/7_flows_开源与商业双线计划书_v_1.md`
  - `docs/dify源码启动教程.md`
  - `docs/rustFS的启动文档.md`

### 2. 社区版专注方向写入稳定策略文档

- 重写 `docs/open-source-commercial-strategy.md`，明确：
  - 社区版首先服务 OpenClaw / 本地 AI 助手黑盒透明化、基础编排、基础追溯和基础协作
  - 社区版不是演示版，但也不承担重型组织治理、白标控制面和企业 SLA
  - “开源给协作，商业给治理”是产品与版本策略，不应再被误写成“纯 Apache / MIT 项目”

### 3. 许可证切换为 Community License

- 将根目录 `LICENSE` 从 GPLv2 占位文本改为 `7Flows Community License`。
- 新许可证采用 Apache 2.0 为基础，并附加以下保留边界：
  - 多租户托管 / 共享控制面需商业授权
  - 直接基于源码做商业化对立面需商业授权
  - 前端去标识、白标分发或替换 7Flows 可见品牌需商业授权
- README、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md` 同步改为“community / source-available 授权”表述，避免继续沿用纯 GPL / 纯 Apache 的旧说法。

### 4. 同步协作约定与当前事实

- `docs/dev/user-preferences.md` 新增两条长期偏好：
  - 本地讨论草稿统一放到 `docs/.taichuy/`
  - 社区版授权采用 Apache 2.0 基底加附加条件
- `docs/dev/runtime-foundation.md` 同步记录：
  - `docs/.taichuy/` 不是默认事实来源
  - 当前许可证已切换为 `7Flows Community License`
  - 下一步规划调整为先做治理最小领域模型，再继续收敛许可证执行口径与传播资产

## 影响范围

- `.gitignore`
- `AGENTS.md`
- `LICENSE`
- `README.md`
- `api/pyproject.toml`
- `docs/README.md`
- `docs/open-source-commercial-strategy.md`
- `docs/dev/user-preferences.md`
- `docs/dev/runtime-foundation.md`
- `docs/.taichuy/`（本地忽略目录）

## 验证

- `git diff --cached --check` 通过
- `api/.venv/Scripts/python.exe -c "import tomllib, pathlib; tomllib.loads(pathlib.Path('api/pyproject.toml').read_text(encoding='utf-8'))"` 通过
- `git status --short` 复核通过：本轮只暂存文档、许可证和元数据改动，未纳入现有 `api/app/services/plugin_runtime*` 拆分中间态
- 人工校对 `LICENSE`、`README.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md` 之间的授权表述是否一致
- 本轮未在当前工作区重跑后端 `pytest`：现有未提交的 `plugin_runtime*` 中间态仍会阻塞全量测试，而本轮未触碰该组文件

## 未决问题与下一步

1. 需要继续把“多租户”“商业化对立面”“前端品牌替换”“白标分发”的执行口径收敛成更细的术语定义，避免未来解释空间过大。
2. 需要补 `organization / workspace / member / role / publish governance` 的最小领域模型设计稿，让许可证边界和产品治理边界彼此对齐。
3. 需要继续把 OpenClaw-first README 截图、demo 路径和首页文案收成对外可传播入口。
