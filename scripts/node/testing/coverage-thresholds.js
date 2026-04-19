const COVERAGE_ROOT = 'tmp/test-governance/coverage';

const frontendThresholds = [
  {
    key: 'agent-flow',
    prefix: 'src/features/agent-flow/',
    thresholds: {
      lines: 70,
      functions: 70,
      statements: 70,
      branches: 55,
    },
  },
  {
    key: 'settings',
    prefix: 'src/features/settings/',
    thresholds: {
      lines: 65,
      functions: 65,
      statements: 65,
      branches: 50,
    },
  },
];

const backendThresholds = [
  { key: 'control-plane', packageName: 'control-plane', line: 70 },
  { key: 'storage-pg', packageName: 'storage-pg', line: 65 },
  { key: 'api-server', packageName: 'api-server', line: 60 },
];

module.exports = {
  COVERAGE_ROOT,
  frontendThresholds,
  backendThresholds,
};
