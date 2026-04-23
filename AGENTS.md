# 记忆
与用户交流过程中命中对应`记忆存储规则`自动更新对应记忆中
@.memory/AGENTS.md
@user-memory.md

# 本项目相关skill在
.agents/skills
如果没有注册，请自行更新到对应约定目录
# 质量控制
1.进入自检、验收、回归或交付阶段时，使用skill `qa-evaluation`；
2.前端实现规则: `web/AGENTS.md`
3.后端实现规则: `api/AGENTS.md`
4.warning 与 coverage 产物统一落到 `tmp/test-governance/`。
# 文件管理约定
1.理论上来说单个代码文件不应该超过1500行
2.当前一个目录下不文件不应该超过15个，超过后应该收纳整理对应子目录
3.测试文件统一放到对应子目录下的_tests
4.如果对应子目录下有AGENTS.md，需要先介绍阅读再做处理
5.所有AGENTS.md，目标是提供短、硬、稳定的本地执行规则，尽可能精准，清晰，简短，最多不得超过200行。
