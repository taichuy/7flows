# Component / Language QA

日期：2026-04-12  
任务：`f40038ee 复验 DESIGN 文档补丁`

## 结论

**通过**

## 判断

### 1. 页面组合 recipe 最小集是否已足够让 Codex 直接复用

**是。**

`docs/draft/DESIGN.md:402-412` 已补入 5 个页面的最小组合 recipe，明确了：
- 每个页面的主块是什么
- 哪些辅助块可以存在
- 主块负责回答页面核心问题，辅助块不得反客为主

这已经足够让 Codex 在 `overview / orchestration / api / logs / monitoring` 五类页面中直接套用，而不是再自行拼页。

### 2. prompt / 命令式 / internal-instruction-like UI 文案禁令是否已足够明确

**是。**

`docs/draft/DESIGN.md:486-508` 已新增明确禁令，已经覆盖：
- prompt-like
- command-like
- internal-instruction-like
- 内部角色名、工具名、评审流转词
- 面向 AI / 开发者的操作提示
- 规则解释、实现备注、占位式指挥句

同时还补了 4 个禁止示例，并明确 UI 文案只允许表达：用户任务、业务对象、系统状态、可执行结果。

### 3. 这两个缺口是否已经关闭

**已关闭。**

`component-language-audit.md` 中要求补的两项，现在都已在 `DESIGN.md` 中形成了可直接执行的规则文本，不再只是评审意见。

## 残余风险

- 当前判断只针对文档补丁本身，不包含对 demo 再次核对。
- 如果后续出现新的页面类型，可能还需要继续扩充 recipe，但当前这轮缺口已经关闭。
