---
memory_type: tool
topic: bash 中带括号路径未加引号会触发语法错误
summary: 用 `sed` 读取包含 `()` 或 `[]` 的路径时，若命令行未加引号，`bash` 会先把它当语法字符解析；给完整路径加单引号后可正常读取。
keywords:
  - bash
  - sed
  - parentheses
  - syntax error
match_when:
  - 使用 `sed`、`cat` 等命令读取带 `()` 或 `[]` 的路径
  - `bash` 报未预期的记号或语法错误
created_at: 2026-04-13 01
updated_at: 2026-04-13 01
last_verified_at: 2026-04-13 01
decision_policy: reference_on_failure
scope:
  - bash
  - sed
  - ../dify/web/app/(shareLayout)/workflow/[token]/page.tsx
---

# bash 中带括号路径未加引号会触发语法错误

## 时间

`2026-04-13 01`

## 失败现象

执行：

```bash
sed -n '1,220p' ../dify/web/app/(shareLayout)/workflow/[token]/page.tsx
```

会直接报 `bash` 语法错误，命令没有真正进入 `sed`。

## 触发条件

- 路径中含有 `(`、`)`、`[`、`]`
- 直接把路径裸写在 shell 命令里

## 根因

`bash` 会先解析这些字符，而不是把它们原样交给下游命令。

## 解法

给完整路径加引号：

```bash
sed -n '1,220p' '../dify/web/app/(shareLayout)/workflow/[token]/page.tsx'
```

## 验证方式

- 同一文件在加引号后可正常输出内容

## 复现记录

- `2026-04-13 01`：首次在读取 `../dify` 路径时触发，随后通过完整路径加引号验证修复。
