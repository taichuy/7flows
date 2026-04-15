# Backend Pressure Scenarios

## Scenario 1: Giant Endpoint

症状：

- 一个接口同时做查询、校验、保存、发布
- 请求体层级很深，字段很多

结论：

- 拆成多个动作
- 让每个入口只表达一个语义

## Scenario 2: Protocol Leakage

症状：

- 核心 service 里直接判断第三方响应字段
- 一换外部协议就要改核心逻辑

结论：

- 把外部结构映射收回适配层
- 核心层只接收稳定业务对象

## Scenario 3: Multi-Writer State

症状：

- handler 能改状态
- service 能改状态
- repository 保存时也会顺手改状态

结论：

- 建立唯一状态入口
- 明确谁负责流转，谁只负责持久化
