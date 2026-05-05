const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getRepoRoot } = require('../testing/warning-capture.js');

const OUTPUT_ROOT = path.join('tmp', 'test-governance');
const VALID_SCOPES = new Set(['ci', 'repo', 'backend', 'coverage']);
const VALID_REPORT_TYPES = new Set(['ci', 'cd']);
const MAX_GATE_OUTPUT_BYTES = 64 * 1024 * 1024;
const FAILURE_EXCERPT_MAX_LINES = 80;
const ANSI_CONTROL_SEQUENCE_PATTERN = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/gu;

function resolveCliEntry(repoRoot, entryName) {
  return path.join(repoRoot, 'scripts', 'node', `${entryName}.js`);
}

function buildGateCommand({ repoRoot, scope }) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`Unknown quality gate scope: ${scope}`);
  }

  const command = process.execPath;

  if (scope === 'coverage') {
    return {
      command,
      args: [resolveCliEntry(repoRoot, 'verify-coverage'), 'all'],
      cwd: repoRoot,
    };
  }

  return {
    command,
    args: [resolveCliEntry(repoRoot, `verify-${scope}`)],
    cwd: repoRoot,
  };
}

function parseBooleanInput(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new Error(`Expected boolean input, received: ${value}`);
}

function normalizeReportType(reportType) {
  const normalized = reportType || 'ci';

  if (!VALID_REPORT_TYPES.has(normalized)) {
    throw new Error(`Unknown quality gate report type: ${normalized}`);
  }

  return normalized;
}

function ensureOutputDir(repoRoot) {
  const outputDir = path.join(repoRoot, OUTPUT_ROOT);
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function formatTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function shortShaFromEnv(env) {
  return (env.GITHUB_SHA || 'unknown').slice(0, 7);
}

function buildRunUrl(env) {
  const serverUrl = env.GITHUB_SERVER_URL || 'https://github.com';
  const repository = env.GITHUB_REPOSITORY || '';
  const runId = env.GITHUB_RUN_ID || '';

  if (!repository || !runId) {
    return '';
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function buildIssueTitle({
  reportType,
  timestamp,
  branch,
  shortSha,
  status,
  environment,
}) {
  const typeLabel = reportType.toUpperCase();
  const target = environment || branch || 'unknown';

  return `[Quality Gate][${typeLabel}] ${timestamp} ${target} ${shortSha} ${status}`;
}

function buildIssueLabels({ reportType, status }) {
  return [
    'quality-gate',
    `${reportType}-report`,
    status,
  ];
}

function listFilesBySuffix(rootDir, suffix) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const collected = [];
  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(suffix)) {
        collected.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return collected.sort();
}

function readFailureExcerpt(logPath) {
  if (!fs.existsSync(logPath)) {
    return '';
  }

  const lines = stripAnsiControlSequences(fs.readFileSync(logPath, 'utf8'))
    .trimEnd()
    .split(/\r?\n/u);
  return selectFailureExcerpt(lines).trim();
}

function stripAnsiControlSequences(value) {
  return value.replace(ANSI_CONTROL_SEQUENCE_PATTERN, '');
}

function selectFailureExcerpt(lines) {
  const rustFailuresIndex = lines.findIndex((line) => line.trim() === 'failures:');
  if (rustFailuresIndex >= 0) {
    return excerptFromAnchorWithSummary({
      lines,
      anchorIndex: rustFailuresIndex,
      summaryIndex: lines.findIndex((line) => /test result: FAILED/u.test(line)),
    });
  }

  const panicIndex = lines.findIndex((line) => /\bpanicked at\b/u.test(line));
  if (panicIndex >= 0) {
    return excerptFromAnchorWithSummary({
      lines,
      anchorIndex: Math.max(0, panicIndex - 2),
      summaryIndex: lines.findIndex((line) => /test result: FAILED/u.test(line)),
    });
  }

  return lines.slice(-FAILURE_EXCERPT_MAX_LINES).join('\n');
}

function excerptFromAnchorWithSummary({ lines, anchorIndex, summaryIndex }) {
  const summaryWillBeAppended = summaryIndex >= anchorIndex + FAILURE_EXCERPT_MAX_LINES;
  const bodyLineBudget = summaryWillBeAppended
    ? FAILURE_EXCERPT_MAX_LINES - 2
    : FAILURE_EXCERPT_MAX_LINES;
  const endIndex = Math.min(lines.length, anchorIndex + bodyLineBudget);
  const excerptLines = lines.slice(anchorIndex, endIndex);

  if (summaryWillBeAppended) {
    excerptLines.push('...');
    excerptLines.push(lines[summaryIndex]);
  }

  return excerptLines.join('\n');
}

function toRepoRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, '/');
}

function readJsonFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readFrontendMetricPct(summary, metric) {
  const value = summary?.total?.[metric]?.pct;
  return Number.isFinite(value) ? value : null;
}

function readBackendMetricPct(summary, metric) {
  const value = summary?.data?.[0]?.totals?.[metric]?.percent;
  return Number.isFinite(value) ? value : null;
}

function formatCoveragePct(value) {
  return value === null ? 'n/a' : `${value.toFixed(2)}%`;
}

function buildCoverageSummaries({ repoRoot, coverageFiles }) {
  return coverageFiles.flatMap((relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    const summary = readJsonFileIfPresent(absolutePath);

    if (!summary) {
      return [{
        name: path.basename(relativePath, '.json'),
        kind: 'unknown',
        path: relativePath,
        metrics: {},
      }];
    }

    if (relativePath.endsWith('coverage/frontend/coverage-summary.json')) {
      return [{
        name: 'frontend total',
        kind: 'frontend',
        path: relativePath,
        metrics: {
          lines: readFrontendMetricPct(summary, 'lines'),
          functions: readFrontendMetricPct(summary, 'functions'),
          statements: readFrontendMetricPct(summary, 'statements'),
          branches: readFrontendMetricPct(summary, 'branches'),
        },
      }];
    }

    if (relativePath.includes('/coverage/backend/')) {
      return [{
        name: path.basename(relativePath, '.json'),
        kind: 'backend',
        path: relativePath,
        metrics: {
          lines: readBackendMetricPct(summary, 'lines'),
          functions: readBackendMetricPct(summary, 'functions'),
          branches: readBackendMetricPct(summary, 'branches'),
          regions: readBackendMetricPct(summary, 'regions'),
        },
      }];
    }

    return [{
      name: path.basename(relativePath, '.json'),
      kind: 'unknown',
      path: relativePath,
      metrics: {},
    }];
  });
}

function formatCoverageSummaryLine(summary) {
  const metricText = Object.entries(summary.metrics)
    .map(([metric, value]) => `${metric} ${formatCoveragePct(value)}`)
    .join(', ');

  return metricText
    ? `- ${summary.name}: ${metricText} (${summary.path})`
    : `- ${summary.name}: see ${summary.path}`;
}

function buildReport({
  repoRoot,
  reportType,
  scope,
  status,
  exitCode,
  issueUrl,
  environmentName,
  timestamp,
  env,
}) {
  const outputDir = path.join(repoRoot, OUTPUT_ROOT);
  const logPath = path.join(outputDir, 'quality-gate.latest.log');
  const warningFiles = listFilesBySuffix(outputDir, '.warnings.log')
    .map((filePath) => toRepoRelative(repoRoot, filePath));
  const coverageFiles = listFilesBySuffix(path.join(outputDir, 'coverage'), '.json')
    .map((filePath) => toRepoRelative(repoRoot, filePath));
  const coverageSummaries = buildCoverageSummaries({ repoRoot, coverageFiles });
  const runUrl = buildRunUrl(env);
  const shortSha = shortShaFromEnv(env);
  const failureExcerpt = status === 'failed' ? readFailureExcerpt(logPath) : '';

  const report = {
    reportType,
    status,
    scope,
    exitCode,
    branch: env.GITHUB_REF_NAME || '',
    commit: env.GITHUB_SHA || '',
    shortSha,
    actor: env.GITHUB_ACTOR || '',
    workflow: env.GITHUB_WORKFLOW || '',
    runUrl,
    environment: environmentName || '',
    timestamp,
    issueUrl,
    logPath: toRepoRelative(repoRoot, logPath),
    warningFiles,
    coverageFiles,
    coverageSummaries,
  };

  const markdown = [
    '# Quality Gate Report',
    '',
    '## Result Summary',
    '',
    `- Type: ${reportType.toUpperCase()}`,
    `- Status: ${status}`,
    `- Exit code: ${exitCode}`,
    `- Scope: ${scope}`,
    environmentName ? `Environment: ${environmentName}` : null,
    `- Branch: ${report.branch || 'unknown'}`,
    `- Commit: ${report.commit || 'unknown'}`,
    `- Actor: ${report.actor || 'unknown'}`,
    runUrl ? `- Run: ${runUrl}` : null,
    '',
    '## Warnings',
    '',
    warningFiles.length === 0 ? 'No warning logs were captured.' : null,
    ...warningFiles.map((filePath) => `- ${filePath}`),
    '',
    '## Coverage',
    '',
    coverageSummaries.length === 0 ? 'No coverage summaries were captured for this scope.' : null,
    ...coverageSummaries.map(formatCoverageSummaryLine),
    '',
    '## Evidence',
    '',
    `- Main log: ${report.logPath}`,
    '- Artifact: test-governance-artifacts',
    ...warningFiles.map((filePath) => `- Warning log: ${filePath}`),
    ...coverageFiles.map((filePath) => `- Coverage summary file: ${filePath}`),
    failureExcerpt ? '' : null,
    failureExcerpt ? '## Failure Excerpt' : null,
    failureExcerpt ? '' : null,
    failureExcerpt ? '```text' : null,
    failureExcerpt || null,
    failureExcerpt ? '```' : null,
  ].filter((line) => line !== null).join('\n');

  return {
    markdown: `${markdown}\n`,
    json: report,
  };
}

function writeReports({ repoRoot, report }) {
  const outputDir = ensureOutputDir(repoRoot);
  const markdownPath = path.join(outputDir, 'quality-gate-report.md');
  const jsonPath = path.join(outputDir, 'quality-gate-report.json');

  fs.writeFileSync(markdownPath, report.markdown, 'utf8');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report.json, null, 2)}\n`, 'utf8');

  return { markdownPath, jsonPath };
}

function writeActionOutputs(outputs, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const content = Object.entries(outputs)
    .map(([key, value]) => `${key}=${String(value).replace(/\n/gu, ' ')}`)
    .join('\n');

  fs.appendFileSync(outputPath, `${content}\n`, 'utf8');
}

function appendStepSummary(markdown, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `\n${markdown}\n`, 'utf8');
}

function createIssueWithGitHubApi({ token, repository, title, body, labels }) {
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is required to create a quality gate issue');
  }

  const requestBody = JSON.stringify({ title, body, labels });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.github.com',
        method: 'POST',
        path: `/repos/${repository}/issues`,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'User-Agent': '1flowbase-quality-gate',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(responseBody));
            return;
          }

          reject(Object.assign(
            new Error(`GitHub Issue creation failed with HTTP ${response.statusCode}: ${responseBody}`),
            { statusCode: response.statusCode }
          ));
        });
      }
    );

    request.on('error', reject);
    request.write(requestBody);
    request.end();
  });
}

function requestGitHubJson({ token, repository, method, path: requestPath, body }) {
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is required for quality gate issue maintenance');
  }

  const requestBody = body === undefined ? '' : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.github.com',
        method,
        path: `/repos/${repository}${requestPath}`,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'User-Agent': '1flowbase-quality-gate',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(responseBody ? JSON.parse(responseBody) : {});
            return;
          }

          reject(Object.assign(
            new Error(`GitHub request failed with HTTP ${response.statusCode}: ${responseBody}`),
            { statusCode: response.statusCode }
          ));
        });
      }
    );

    request.on('error', reject);
    if (requestBody) {
      request.write(requestBody);
    }
    request.end();
  });
}

function listOpenQualityGateIssuesWithGitHubApi({ token, repository }) {
  return requestGitHubJson({
    token,
    repository,
    method: 'GET',
    path: '/issues?state=open&labels=quality-gate&per_page=100',
  });
}

function closeIssueWithGitHubApi({ token, repository, number }) {
  return requestGitHubJson({
    token,
    repository,
    method: 'PATCH',
    path: `/issues/${number}`,
    body: { state: 'closed' },
  });
}

async function createIssueWithLabelFallback({ createIssueImpl, issue }) {
  try {
    return await createIssueImpl(issue);
  } catch (error) {
    if (error.statusCode !== 422 || issue.labels.length === 0) {
      throw error;
    }

    return createIssueImpl({
      ...issue,
      labels: [],
    });
  }
}

function issueNumberFromIssue(issue) {
  if (Number.isInteger(issue.number)) {
    return issue.number;
  }

  const match = String(issue.html_url || '').match(/\/issues\/(\d+)$/u);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function closeStaleOpenQualityGateIssues({
  token,
  repository,
  latestIssue,
  listOpenQualityGateIssuesImpl,
  closeIssueImpl,
}) {
  const latestIssueNumber = issueNumberFromIssue(latestIssue);

  if (!latestIssueNumber) {
    return;
  }

  const openIssues = await listOpenQualityGateIssuesImpl({ token, repository });

  for (const issue of openIssues) {
    const issueNumber = issueNumberFromIssue(issue);

    if (!issueNumber || issueNumber === latestIssueNumber) {
      continue;
    }

    await closeIssueImpl({
      token,
      repository,
      number: issueNumber,
    });
  }
}

function runGateCommand({
  commandSpec,
  env,
  logPath,
  spawnSyncImpl = spawnSync,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
}) {
  const result = spawnSyncImpl(commandSpec.command, commandSpec.args, {
    cwd: commandSpec.cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_GATE_OUTPUT_BYTES,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  if (stdout) {
    writeStdout(stdout);
  }

  if (stderr) {
    writeStderr(stderr);
  }

  fs.writeFileSync(logPath, `${stdout}${stderr}`, 'utf8');

  return result.status ?? 1;
}

async function runQualityGate({
  repoRoot = getRepoRoot(),
  scope = 'ci',
  reportType = 'ci',
  publishIssue = false,
  githubToken = '',
  environmentName = '',
  env = process.env,
  nowImpl = () => new Date(),
  spawnSyncImpl = spawnSync,
  createIssueImpl = createIssueWithGitHubApi,
  listOpenQualityGateIssuesImpl = listOpenQualityGateIssuesWithGitHubApi,
  closeIssueImpl = closeIssueWithGitHubApi,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
} = {}) {
  const normalizedReportType = normalizeReportType(reportType);
  const outputDir = ensureOutputDir(repoRoot);
  const logPath = path.join(outputDir, 'quality-gate.latest.log');
  const commandSpec = buildGateCommand({ repoRoot, scope });
  const gateExitCode = runGateCommand({
    commandSpec,
    env,
    logPath,
    spawnSyncImpl,
    writeStdout,
    writeStderr,
  });
  const status = gateExitCode === 0 ? 'passed' : 'failed';
  const timestamp = formatTimestamp(nowImpl());
  let issueUrl = '';

  const report = buildReport({
    repoRoot,
    reportType: normalizedReportType,
    scope,
    status,
    exitCode: gateExitCode,
    issueUrl,
    environmentName,
    timestamp,
    env,
  });
  const reportPaths = writeReports({ repoRoot, report });

  if (publishIssue) {
    if (!githubToken) {
      throw new Error('github_token is required when publish_issue is true');
    }

    const issue = await createIssueWithLabelFallback({
      createIssueImpl,
      issue: {
        token: githubToken,
        repository: env.GITHUB_REPOSITORY,
        title: buildIssueTitle({
          reportType: normalizedReportType,
          timestamp,
          branch: env.GITHUB_REF_NAME || '',
          shortSha: shortShaFromEnv(env),
          status,
          environment: environmentName,
        }),
        body: report.markdown,
        labels: buildIssueLabels({
          reportType: normalizedReportType,
          status,
        }),
      },
    });
    issueUrl = issue.html_url || '';
    await closeStaleOpenQualityGateIssues({
      token: githubToken,
      repository: env.GITHUB_REPOSITORY,
      latestIssue: issue,
      listOpenQualityGateIssuesImpl,
      closeIssueImpl,
    });
  }

  const finalReport = issueUrl
    ? buildReport({
      repoRoot,
      reportType: normalizedReportType,
      scope,
      status,
      exitCode: gateExitCode,
      issueUrl,
      environmentName,
      timestamp,
      env,
    })
    : report;

  if (issueUrl) {
    writeReports({ repoRoot, report: finalReport });
  }

  appendStepSummary(finalReport.markdown);
  writeActionOutputs({
    status,
    exit_code: gateExitCode,
    report_path: toRepoRelative(repoRoot, reportPaths.markdownPath),
    report_json_path: toRepoRelative(repoRoot, reportPaths.jsonPath),
    issue_url: issueUrl,
  });

  return {
    status,
    exitCode: gateExitCode,
    issueUrl,
    reportPath: reportPaths.markdownPath,
    reportJsonPath: reportPaths.jsonPath,
  };
}

module.exports = {
  buildGateCommand,
  buildIssueLabels,
  buildIssueTitle,
  buildReport,
  closeIssueWithGitHubApi,
  createIssueWithGitHubApi,
  listOpenQualityGateIssuesWithGitHubApi,
  parseBooleanInput,
  runQualityGate,
};
