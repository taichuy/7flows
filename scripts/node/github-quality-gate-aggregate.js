#!/usr/bin/env node

const path = require('node:path');

const {
  parseBooleanInput,
  runQualityGateAggregate,
} = require('./github-quality-gate/core.js');

function readInputs(env = process.env) {
  return {
    artifactRoot: env.INPUT_ARTIFACT_ROOT || path.join('tmp', 'test-governance', 'parallel'),
    reportType: env.INPUT_REPORT_TYPE || 'ci',
    publishIssue: parseBooleanInput(env.INPUT_PUBLISH_ISSUE),
    githubToken: env.INPUT_GITHUB_TOKEN || '',
    environmentName: env.INPUT_ENVIRONMENT || '',
  };
}

async function main(_argv = [], deps = {}) {
  const env = deps.env || process.env;
  const inputs = readInputs(env);
  const result = await runQualityGateAggregate({
    ...inputs,
    env,
    repoRoot: deps.repoRoot,
    createIssueImpl: deps.createIssueImpl,
    listOpenQualityGateIssuesImpl: deps.listOpenQualityGateIssuesImpl,
    closeIssueImpl: deps.closeIssueImpl,
  });

  return result.exitCode;
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[1flowbase-quality-gate-aggregate] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  main,
  readInputs,
};
