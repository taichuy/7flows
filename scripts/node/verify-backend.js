#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

const commands = [
  ["cargo", ["fmt", "--all", "--check"]],
  ["cargo", ["clippy", "--workspace", "--all-targets", "--", "-D", "warnings"]],
  ["cargo", ["test", "--workspace"]],
  ["cargo", ["check", "--workspace"]],
];

for (const [cmd, args] of commands) {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: "api" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
