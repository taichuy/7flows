const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_SOURCE,
  DEFAULT_TARGET,
  convertSkillSourceToClaudeSkill,
  parseCliArgs,
  syncClaudeSkills,
} = require('../core.js');

test('parseCliArgs defaults to syncing .agents skills into .claude skills', () => {
  assert.deepEqual(parseCliArgs([]), {
    help: false,
    source: path.join('.agents', 'skills'),
    target: path.join('.claude', 'skills'),
  });
});

test('convertSkillSourceToClaudeSkill rewrites description into Claude block scalar format', () => {
  const source = [
    '---',
    'name: backend-development',
    'description: Use when building or changing backend APIs',
    '---',
    '',
    '# Backend Development',
    '',
    'Structured backend guidance.',
    '',
  ].join('\n');

  assert.equal(
    convertSkillSourceToClaudeSkill(source),
    [
      '---',
      'name: backend-development',
      'description: |',
      '  Use when building or changing backend APIs',
      '---',
      '',
      '# Backend Development',
      '',
      'Structured backend guidance.',
      '',
    ].join('\n')
  );
});

test('syncClaudeSkills writes each converted skill into .claude/skills/<name>/SKILL.md', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-claude-skill-sync-'));
  const sourceSkillDir = path.join(repoRoot, '.agents', 'skills', 'backend-development');
  const sourceReferencesDir = path.join(sourceSkillDir, 'references');

  fs.mkdirSync(sourceSkillDir, { recursive: true });
  fs.mkdirSync(sourceReferencesDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceSkillDir, 'SKILL.md'),
    [
      '---',
      'name: backend-development',
      'description: Use when building or changing backend APIs',
      '---',
      '',
      '# Backend Development',
      '',
      'Structured backend guidance.',
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(path.join(sourceReferencesDir, 'api-design.md'), '# API Design\n', 'utf8');

  const result = syncClaudeSkills({ repoRoot });
  const targetFile = path.join(repoRoot, '.claude', 'skills', 'backend-development', 'SKILL.md');
  const targetReferenceFile = path.join(
    repoRoot,
    '.claude',
    'skills',
    'backend-development',
    'references',
    'api-design.md'
  );

  assert.equal(result.count, 1);
  assert.deepEqual(result.skillNames, ['backend-development']);
  assert.equal(fs.existsSync(targetFile), true);
  assert.equal(fs.existsSync(targetReferenceFile), true);
  assert.equal(
    fs.readFileSync(targetFile, 'utf8'),
    [
      '---',
      'name: backend-development',
      'description: |',
      '  Use when building or changing backend APIs',
      '---',
      '',
      '# Backend Development',
      '',
      'Structured backend guidance.',
      '',
    ].join('\n')
  );
  assert.equal(fs.readFileSync(targetReferenceFile, 'utf8'), '# API Design\n');
});
