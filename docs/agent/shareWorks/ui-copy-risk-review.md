# UI Copy Risk Review

日期：2026-04-12  
任务：`3c43c5cf 复验 UI 是否存在提示词/命令泄漏风险`

## 结论

**当前还没有被充分防止。**

- 正向判断：
  当前 demo 文案本身没有明显出现 prompt-like / command-like / internal-instruction-like 泄漏；`tmp/demo/index.html` 里的用户可见文本基本都在描述产品状态、任务域和业务动作，没有直接出现 `prompt`、`system`、`planner`、`worker`、`Codex`、命令行或“按以下规则执行”这类内部语句。
- 风险判断：
  `docs/draft/DESIGN.md` 现在虽然禁止“设计说明 / 注释文案 / 规则解释文字”进入 UI，也限制 no-op 按钮，但**还没有一条专门的 copy 禁令**去明确拦住：
  - prompt-like 文案
  - command-like 文案
  - internal-instruction-like 文案
  - 内部角色 / 工具 / 规划过程词汇进入默认产品 UI

## 最小需要新增的禁令

建议在 `docs/draft/DESIGN.md` 新增一条最小禁令：

> **用户可见 UI 文案禁止出现任何 prompt-like、command-like、internal-instruction-like 表达。**  
> 禁止把提示词、命令、系统/开发者指令、内部角色名、工具名、评审过程词、实现备注直接写进默认产品 UI。  
> UI 文案只能表达：用户任务、业务对象、系统状态、可执行结果。  
> 若内容是给 AI / 开发者 / 评审者看的，应留在设计文档、注释或开发工具视图，不得进入默认产品界面。

这是一条**最小且足够有效**的补充；加上它后，当前规则才算真正对这类泄漏风险形成明确拦截。
