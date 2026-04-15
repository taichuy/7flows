# 文档计划审计待讨论

更新时间：`2026-04-16 07:07 CST`

说明：本轮只保留新的讨论重点，不重复前几轮已经讲清的旧问题。重点从 `进度衡量口径`、`统一门禁可信度`、`文档治理负担`、`工作树稳定性` 四个角度看。

## 1. 现状

- 最近 `24` 小时共有 `46` 次提交，触达 `192` 个文件。
- 当前真实主线仍然是：
  - `Application 宿主 -> orchestration -> agentFlow editor`
- 当前真实开发状态：
  - `03` 已经是可运行基线
  - `04` 已经是可运行基线
  - `05/06B` 还没有最小产品闭环
- 本轮验证结果：
  - `pnpm --dir web lint` 通过，但 `node-registry.tsx` 还有 `4` 条 warning
  - `pnpm --dir web test` 通过，`30` 个测试文件、`89` 个测试
  - `pnpm --dir web/app build` 通过，但主包还是 `5.19 MB`
  - `node scripts/node/verify-backend.js` 失败，卡在 `rustfmt --check`
  - 三条定向 Rust 测试都通过
  - `style-boundary` 本轮未拿到新的成功结果，当前环境拉起前端时仍会触发 `0.0.0.0:3100` 的 `EPERM`
- 本轮新增或升级的问题：
  1. 模块状态文档已经双向失真：
     - 有的还把 `03/04` 说成待开发或未来设计
     - 有的又把 `04` 说成已完成
  2. 官方统一门禁还是红的，但局部行为测试是绿的
  3. 文档治理本身开始变重：
     - `docs` 类提交 `12` 次
     - 两份 implementation plan 各被改了 `8` 次
     - `plans/history` 有 `22` 个文件
     - `specs/history` 有 `20` 个文件
     - 两份主计划文档都超过 `2000` 行
  4. 当前工作树仍有未提交的 editor 主线改动，说明审计面对的是移动目标

## 2. 可能方向

### 方向 A：先把状态口径重新统一

- 把：
  - `北极星目标`
  - `当前阶段目标`
  - `已验证代码基线`
  分开写

### 方向 B：先把统一门禁重新拉回可信

- 修 `verify-backend`
- 给 style-boundary 一个当前环境下真正可跑的路径

### 方向 C：先把文档系统减重

- 拆分超大计划文档
- 收纳 history 目录
- 改成轻量状态板而不是长文档反复重写

### 方向 D：开始补最小 `05/06B` 证明

- API Key
- Run List / Run Detail
- publish-gateway 真实边界

### 方向 E：继续只追 editor 日更

- 继续补节点和交互

## 3. 不同方向的风险和收益

### 方向 A：先统一状态口径

- 收益：后续判断进度会回到同一真值层
- 风险：短期不增加新功能

### 方向 B：先统一门禁

- 收益：收尾定义会重新清楚
- 风险：短期投入主要落在格式、脚本和执行路径

### 方向 C：先减文档重量

- 收益：审计和计划不会继续吞掉太多开发额度
- 风险：需要先治理现有文档组织

### 方向 D：先补 `05/06B`

- 收益：最快证明产品没有偏成纯 editor
- 风险：如果 A/B/C 不先做，会把旧问题带进新模块

### 方向 E：继续只追 editor

- 收益：用户可见变化最快
- 风险：会继续放大进度失真、门禁失真和文档维护税

## 4. 对此你建议是什么？

建议顺序：`先 A+B，一轮一起做；再 C；再 D；最后才继续 E`。

### 我建议先做的事

1. 同步改正以下文档的状态口径：
   - `product requirements`
   - `modules/README`
   - `03 README`
   - `04 README`
2. 让 `verify-backend` 回到可绿状态
3. 给 style-boundary 明确正式执行路径
4. 把 `HEAD` 和 dirty worktree 分开记录，避免把未提交 editor 改动直接当正式事实
5. 拆分两份超过 `2000` 行的 implementation plan，并压缩 history 目录

### 我建议随后做的事

1. 把当前阶段正式改口径为：
   - `Application-hosted authoring baseline 已落地`
   - `下一步补 publish/runtime 最小闭环证明`
2. 再补：
   - 应用级 API Key
   - 最小 Run List / Run Detail
   - `publish-gateway` 真实接口边界

### 当前不建议优先做的事

1. 继续只看提交数来判断进度
2. 继续接受“统一门禁红、局部行为绿”作为默认收尾
3. 继续让审计主文档和 implementation plan 成为高频重写对象
4. 继续只追 editor，而不先收口状态真值和门禁
