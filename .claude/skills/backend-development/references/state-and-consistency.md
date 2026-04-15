# State And Consistency Checklist

## Define The State First

写实现前先回答：

- 状态集合是什么？
- 允许哪些流转？
- 每个动作能把状态从哪里推到哪里？
- 哪个入口负责改这个状态？

## Review Questions

- 谁能写这个状态？
- 是不是只有一个明确入口？
- 有没有绕过主入口的隐式改写？
- 数据一致性和状态一致性分别靠什么保证？
- 失败、重试、回滚时状态是否仍然可解释？

## Warning Signs

- 多个 handler 都能直接把对象改成“完成”
- repository 内偷偷附带状态跳转
- 只有代码路径，没有显式状态规则
- 没有办法回答“为什么现在是这个状态”
