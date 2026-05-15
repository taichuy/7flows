---
created_at: 2026-05-15 10
feedback_category: repository
decision_policy: direct_reference
---

# 表格内部滚动条与表格外层滚动的边界

规则：用户要求去掉“表格内部”滚动条时，先确认是横向还是纵向；不能同时把外层滚动也关掉。日志表这次目标是去掉 Ant Design Table body 内部纵向滚动条，但保留日志列表外层上下滚动，并继续保留外层容器的列横向滚动，避免把列压缩堆在一起。

原因：Ant Design Table 的 `scroll.x` / `scroll.y` / sticky scrollbar 会在表格内部生成独立滚动容器。修复目标通常是把对应方向的滚动 ownership 移到一层明确的外部容器，而不是隐藏所有 overflow 或把列宽改成强制自适应。

适用场景：日志表、数据表、字段较多的后台表格出现双滚动条或用户明确说“里面那个滚动条去掉”时。
