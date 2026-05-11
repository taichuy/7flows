const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getRepoRoot } = require('../testing/warning-capture.js');
const { BACKEND_CONSISTENCY_TARGETS } = require('../verify/index.js');

const OUTPUT_ROOT = path.join('tmp', 'test-governance');
const BACKEND_CONSISTENCY_TARGET_REPORT_FILE = 'backend-consistency-targets.json';
const DEFAULT_AGGREGATE_SCOPES = ['repo', 'backend-consistency', 'coverage'];
const VALID_SCOPES = new Set(['ci', 'repo', 'backend', 'backend-consistency', 'coverage']);
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
  const metricSummary = summary?.total?.[metric];
  if (metricSummary && Number.isFinite(metricSummary.total) && metricSummary.total === 0) {
    return null;
  }

  const value = metricSummary?.pct;
  return Number.isFinite(value) ? value : null;
}

function readBackendMetricPct(summary, metric) {
  const metricSummary = summary?.data?.[0]?.totals?.[metric];
  if (metricSummary && Number.isFinite(metricSummary.count) && metricSummary.count === 0) {
    return null;
  }

  const value = metricSummary?.percent;
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

function normalizeBackendConsistencyTarget(target) {
  return {
    label: target.label,
    packageName: target.packageName,
    filter: target.filter,
    status: target.status || 'not_run',
    exitCode: Number.isFinite(target.exitCode) ? target.exitCode : null,
    durationMs: Number.isFinite(target.durationMs) ? target.durationMs : null,
    passedCount: Number.isFinite(target.passedCount) ? target.passedCount : null,
    failedCount: Number.isFinite(target.failedCount) ? target.failedCount : null,
  };
}

function readBackendConsistencyTargetReport(repoRoot) {
  const report = readJsonFileIfPresent(path.join(
    repoRoot,
    OUTPUT_ROOT,
    BACKEND_CONSISTENCY_TARGET_REPORT_FILE
  ));

  return Array.isArray(report?.targets)
    ? report.targets.map(normalizeBackendConsistencyTarget)
    : [];
}

function buildBackendConsistencyTargets({ repoRoot, scope }) {
  if (scope !== 'ci' && scope !== 'backend-consistency') {
    return [];
  }

  const targetReport = readBackendConsistencyTargetReport(repoRoot);

  if (targetReport.length > 0) {
    return targetReport;
  }

  return BACKEND_CONSISTENCY_TARGETS.map(normalizeBackendConsistencyTarget);
}

function formatDurationMs(durationMs) {
  return durationMs === null ? 'n/a' : `${(durationMs / 1000).toFixed(2)}s`;
}

function formatBackendConsistencyTargetLine(target) {
  return `| \`${target.label}\` | \`${target.packageName}\` | \`${target.filter}\` | `
    + `${target.status} | ${formatDurationMs(target.durationMs)} | `
    + `${target.passedCount ?? 'n/a'} | ${target.failedCount ?? 'n/a'} |`;
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
  const backendConsistencyTargets = buildBackendConsistencyTargets({ repoRoot, scope });
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
    backendConsistencyTargets,
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
    environmentName ? `- Environment: ${environmentName}` : null,
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
    backendConsistencyTargets.length > 0 ? '## Backend Consistency Targets' : null,
    backendConsistencyTargets.length > 0 ? '' : null,
    backendConsistencyTargets.length > 0 ? '| Label | Package | Rust test filter | Status | Duration | Passed | Failed |' : null,
    backendConsistencyTargets.length > 0 ? '| --- | --- | --- | --- | ---: | ---: | ---: |' : null,
    ...backendConsistencyTargets.map(formatBackendConsistencyTargetLine),
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

function readQualityGateArtifactReports({ repoRoot, artifactRoot }) {
  const absoluteArtifactRoot = path.isAbsolute(artifactRoot)
    ? artifactRoot
    : path.join(repoRoot, artifactRoot);

  if (!fs.existsSync(absoluteArtifactRoot)) {
    return [];
  }

  const reports = listFilesBySuffix(absoluteArtifactRoot, 'quality-gate-report.json')
    .map((reportPath) => {
      const report = readJsonFileIfPresent(reportPath);

      if (!report) {
        return null;
      }

      const artifactPath = path.dirname(reportPath);
      const artifactName = path.relative(absoluteArtifactRoot, artifactPath).split(path.sep)[0]
        || path.basename(artifactPath);
      const scope = report.scope || artifactName.replace(/^test-governance-/u, '');

      return {
        artifactName,
        artifactPath,
        reportPath,
        scope,
        report,
      };
    })
    .filter(Boolean);

  return reports.sort((left, right) => left.scope.localeCompare(right.scope));
}

function dedupeBy(items, keyForItem) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = keyForItem(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizeComponentReport({ repoRoot, artifact }) {
  const exitCode = Number.isFinite(artifact.report.exitCode) ? artifact.report.exitCode : 1;
  const status = artifact.report.status === 'passed' && exitCode === 0 ? 'passed' : 'failed';
  const logPath = artifact.artifactPath
    ? path.join(artifact.artifactPath, 'quality-gate.latest.log')
    : '';

  return {
    artifactName: artifact.artifactName,
    scope: artifact.scope,
    status,
    exitCode,
    reportPath: artifact.reportPath ? toRepoRelative(repoRoot, artifact.reportPath) : '',
    logPath: fs.existsSync(logPath) ? toRepoRelative(repoRoot, logPath) : '',
    failureExcerpt: status === 'failed'
      ? (artifact.missing ? `No quality gate artifact was downloaded for scope: ${artifact.scope}` : readFailureExcerpt(logPath))
      : '',
  };
}

function addMissingAggregateScopes({ componentArtifacts, expectedScopes }) {
  const seenScopes = new Set(componentArtifacts.map((artifact) => artifact.scope));
  const missingArtifacts = expectedScopes
    .filter((scope) => !seenScopes.has(scope))
    .map((scope) => ({
      artifactName: `missing-${scope}`,
      artifactPath: '',
      reportPath: '',
      scope,
      missing: true,
      report: {
        status: 'failed',
        scope,
        exitCode: 1,
        coverageSummaries: [],
        backendConsistencyTargets: [],
        warningFiles: [],
      },
    }));

  return [...componentArtifacts, ...missingArtifacts]
    .sort((left, right) => left.scope.localeCompare(right.scope));
}

function buildAggregateReport({
  repoRoot,
  reportType,
  componentArtifacts,
  issueUrl,
  environmentName,
  timestamp,
  env,
}) {
  const components = componentArtifacts.map((artifact) => normalizeComponentReport({ repoRoot, artifact }));
  const status = components.every((component) => component.status === 'passed') ? 'passed' : 'failed';
  const exitCode = status === 'passed'
    ? 0
    : components.find((component) => component.exitCode !== 0)?.exitCode || 1;
  const warningFiles = dedupeBy(
    componentArtifacts.flatMap((artifact) => artifact.report.warningFiles || []),
    (filePath) => filePath
  );
  const coverageSummaries = dedupeBy(
    componentArtifacts.flatMap((artifact) => artifact.report.coverageSummaries || []),
    (summary) => `${summary.kind || 'unknown'}:${summary.name}:${summary.path}`
  );
  const backendConsistencyTargets = componentArtifacts.flatMap(
    (artifact) => artifact.report.backendConsistencyTargets || []
  );
  const runUrl = buildRunUrl(env);
  const shortSha = shortShaFromEnv(env);
  const outputDir = path.join(repoRoot, OUTPUT_ROOT);
  const logPath = path.join(outputDir, 'quality-gate.latest.log');

  const report = {
    reportType,
    status,
    scope: 'ci',
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
    coverageFiles: coverageSummaries.map((summary) => summary.path).filter(Boolean),
    coverageSummaries,
    backendConsistencyTargets,
    components,
  };

  const failedComponents = components.filter((component) => component.status !== 'passed');
  const markdown = [
    '# Quality Gate Report',
    '',
    '## Result Summary',
    '',
    `- Type: ${reportType.toUpperCase()}`,
    `- Status: ${status}`,
    `- Exit code: ${exitCode}`,
    '- Scope: ci',
    environmentName ? `- Environment: ${environmentName}` : null,
    `- Branch: ${report.branch || 'unknown'}`,
    `- Commit: ${report.commit || 'unknown'}`,
    `- Actor: ${report.actor || 'unknown'}`,
    runUrl ? `- Run: ${runUrl}` : null,
    '',
    '## Component Results',
    '',
    '| Scope | Status | Exit code | Artifact |',
    '| --- | --- | ---: | --- |',
    ...components.map((component) => (
      `| \`${component.scope}\` | ${component.status} | ${component.exitCode} | `
        + `\`${component.artifactName}\` |`
    )),
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
    backendConsistencyTargets.length > 0 ? '## Backend Consistency Targets' : null,
    backendConsistencyTargets.length > 0 ? '' : null,
    backendConsistencyTargets.length > 0 ? '| Label | Package | Rust test filter | Status | Duration | Passed | Failed |' : null,
    backendConsistencyTargets.length > 0 ? '| --- | --- | --- | --- | ---: | ---: | ---: |' : null,
    ...backendConsistencyTargets.map(formatBackendConsistencyTargetLine),
    '',
    '## Evidence',
    '',
    `- Main log: ${report.logPath}`,
    '- Artifact: test-governance-artifacts',
    ...components.flatMap((component) => [
      component.reportPath ? `- Component report: ${component.reportPath}` : null,
      component.logPath ? `- Component log: ${component.logPath}` : null,
    ]),
    ...warningFiles.map((filePath) => `- Warning log: ${filePath}`),
    ...coverageSummaries.map((summary) => `- Coverage summary file: ${summary.path}`),
    ...failedComponents.flatMap((component) => (
      component.failureExcerpt
        ? [
          '',
          `## Failure Excerpt: ${component.scope}`,
          '',
          '```text',
          component.failureExcerpt,
          '```',
        ]
        : []
    )),
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
    body: { state: 'closed', state_reason: 'completed' },
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

function isPullRequestIssue(issue) {
  return issue && typeof issue === 'object' && issue.pull_request !== undefined;
}

function qualityGateIssueScopeFromTitle(title) {
  const match = String(title || '').match(
    /^\[Quality Gate\]\[([^\]]+)\]\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+(\S+)\s+\S+\s+(?:passed|failed)$/u
  );

  return match
    ? {
      reportType: match[1],
      target: match[2],
    }
    : null;
}

function isSameQualityGateScope(issue, latestScope) {
  if (!latestScope) {
    return false;
  }

  const issueScope = qualityGateIssueScopeFromTitle(issue.title);

  return Boolean(
    issueScope
    && issueScope.reportType === latestScope.reportType
    && issueScope.target === latestScope.target
  );
}

async function closeStaleOpenQualityGateIssues({
  token,
  repository,
  latestIssue,
  listOpenQualityGateIssuesImpl,
  closeIssueImpl,
}) {
  const latestIssueNumber = issueNumberFromIssue(latestIssue);
  const latestScope = qualityGateIssueScopeFromTitle(latestIssue.title);

  if (!latestIssueNumber || !latestScope) {
    return;
  }

  const openIssues = await listOpenQualityGateIssuesImpl({ token, repository });

  for (const issue of openIssues) {
    if (isPullRequestIssue(issue)) {
      continue;
    }

    const issueNumber = issueNumberFromIssue(issue);

    if (!issueNumber || issueNumber === latestIssueNumber) {
      continue;
    }

    if (!isSameQualityGateScope(issue, latestScope)) {
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

async function runQualityGateAggregate({
  repoRoot = getRepoRoot(),
  artifactRoot = path.join(OUTPUT_ROOT, 'parallel'),
  expectedScopes = DEFAULT_AGGREGATE_SCOPES,
  reportType = 'ci',
  publishIssue = false,
  githubToken = '',
  environmentName = '',
  env = process.env,
  nowImpl = () => new Date(),
  createIssueImpl = createIssueWithGitHubApi,
  listOpenQualityGateIssuesImpl = listOpenQualityGateIssuesWithGitHubApi,
  closeIssueImpl = closeIssueWithGitHubApi,
} = {}) {
  const normalizedReportType = normalizeReportType(reportType);
  const outputDir = ensureOutputDir(repoRoot);
  const componentArtifacts = addMissingAggregateScopes({
    componentArtifacts: readQualityGateArtifactReports({ repoRoot, artifactRoot }),
    expectedScopes,
  });
  const timestamp = formatTimestamp(nowImpl());
  const aggregateLogPath = path.join(outputDir, 'quality-gate.latest.log');
  fs.writeFileSync(
    aggregateLogPath,
    componentArtifacts
      .map((artifact) => {
        const componentLogPath = path.join(artifact.artifactPath, 'quality-gate.latest.log');
        const componentLog = fs.existsSync(componentLogPath)
          ? fs.readFileSync(componentLogPath, 'utf8').trimEnd()
          : '';

        return [
          `===== ${artifact.scope} (${artifact.artifactName}) =====`,
          componentLog,
        ].filter(Boolean).join('\n');
      })
      .join('\n\n'),
    'utf8'
  );

  let issueUrl = '';
  const report = buildAggregateReport({
    repoRoot,
    reportType: normalizedReportType,
    componentArtifacts,
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
          status: report.json.status,
          environment: environmentName,
        }),
        body: report.markdown,
        labels: buildIssueLabels({
          reportType: normalizedReportType,
          status: report.json.status,
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
    ? buildAggregateReport({
      repoRoot,
      reportType: normalizedReportType,
      componentArtifacts,
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
    status: finalReport.json.status,
    exit_code: finalReport.json.exitCode,
    report_path: toRepoRelative(repoRoot, reportPaths.markdownPath),
    report_json_path: toRepoRelative(repoRoot, reportPaths.jsonPath),
    issue_url: issueUrl,
  });

  return {
    status: finalReport.json.status,
    exitCode: finalReport.json.exitCode,
    issueUrl,
    reportPath: reportPaths.markdownPath,
    reportJsonPath: reportPaths.jsonPath,
  };
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
  buildAggregateReport,
  buildGateCommand,
  buildIssueLabels,
  buildIssueTitle,
  buildReport,
  closeIssueWithGitHubApi,
  createIssueWithGitHubApi,
  listOpenQualityGateIssuesWithGitHubApi,
  parseBooleanInput,
  runQualityGateAggregate,
  runQualityGate,
};
