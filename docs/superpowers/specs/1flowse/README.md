# 1Flowse 规格文档

当前目录用于集中管理 1Flowse 的产品与系统规格文档。

## 文档列表

- [2026-04-10-product-design.md](./2026-04-10-product-design.md)
  - 产品定位、范围边界、核心对象、交互结构、P1 成功标准
- [2026-04-10-product-requirements.md](./2026-04-10-product-requirements.md)
  - P1 需求文档，覆盖功能需求、非功能需求、验收边界
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)
  - P1 架构文档，覆盖系统模块、存储分层、运行时模型、扩展策略
- [2026-04-11-p1-tech-stack-communication-baseline.md](./2026-04-11-p1-tech-stack-communication-baseline.md)
  - P1 统一技术栈、通信边界与对内对外口径摘要
- [2026-04-11-fullstack-bootstrap-design.md](./2026-04-11-fullstack-bootstrap-design.md)
  - 前后端最小可跑骨架与仓库内项目专用 skill 的初始化设计稿
- [2026-04-11-embedded-app-static-upload-design.md](./2026-04-11-embedded-app-static-upload-design.md)
  - Embedded App 以静态产物 zip 上传、路由挂载与登录态复用接入平台的设计稿
- [2026-04-11-development-skills-design.md](./2026-04-11-development-skills-design.md)
  - 前后端通用开发 Skill 的设计稿，聚焦防止代码腐化的原则、检查清单与少量示例
- [2026-04-12-backend-interface-kernel-design.md](./2026-04-12-backend-interface-kernel-design.md)
  - 后端接口内核、扩展边界、runtime 与业务插件白名单的统一设计稿
- [2026-04-12-backend-engineering-quality-design.md](./2026-04-12-backend-engineering-quality-design.md)
  - 后端工程分层、实现模板、命名、一致性、测试与质量门禁的统一规范
- [modules/README.md](./modules/README.md)
  - 模块化讨论目录，按功能模块逐项沉淀讨论进度与完成情况

## 约定

- 当前阶段先沉淀 `产品设计 -> 需求文档 -> 架构文档`
- 同主题文档尽量放在同一目录下持续演进
- 文件名优先使用 ASCII，便于工具链与脚本处理
- 功能模块讨论统一收敛到 `modules/` 子目录维护
