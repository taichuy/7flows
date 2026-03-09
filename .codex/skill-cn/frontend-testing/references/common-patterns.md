# 通用测试模式

## 查询优先级

优先顺序：

1. `getByRole`
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByTestId` 仅在确无更好选择时使用

## 常见行为模式

### 条件渲染

重点覆盖：

- loading
- empty
- success
- error
- unsupported

### 表单

重点覆盖：

- 默认值
- 字段显隐
- 校验错误
- 提交禁用态
- 提交成功/失败反馈

### 列表与卡片

重点覆盖：

- 渲染数量
- 空状态
- 点击/选择回调
- 排序或过滤后的展示结果

### 调试与状态视图

重点覆盖：

- 时间线有无数据
- 当前节点状态徽标
- 日志为空时的占位
- 失败时的错误内容

## 数据驱动测试

对于状态枚举或协议枚举，优先考虑数据驱动测试，例如：

- `pending` / `running` / `succeeded` / `failed`
- `native` / `openai` / `anthropic`

## 不要做的事

- 测试内部实现细节
- 依赖精确文案而不是行为
- 在断言不存在时使用 `getBy*`
- 把多个行为混进一个测试用例
