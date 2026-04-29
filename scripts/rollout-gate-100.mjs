import { spawnSync } from 'node:child_process';

const isQuick = process.argv.includes('--quick');

const checks = [
  {
    id: 'syntax-electron',
    description: 'Electron runtime syntax',
    command: 'node --check electron/main.cjs',
    required: true,
  },
  {
    id: 'syntax-server',
    description: 'Server runtime syntax',
    command: 'node --check server/index.js',
    required: true,
  },
  {
    id: 'desktop-preflight',
    description: 'Desktop preflight checks',
    command: 'npm run desktop:doctor-check',
    required: true,
  },
  {
    id: 'desktop-store-ui-tests',
    description: 'Phase 1 desktop sync/store/UI tests',
    command: 'npx vitest run src/test/desktop-sync-store.test.ts src/test/desktop-ui-phase1.test.tsx',
    required: true,
  },
  {
    id: 'desktop-sync-integration',
    description: 'Desktop end-to-end sync integration',
    command: 'npm run test:desktop:integration',
    required: !isQuick,
    requiredOutputSnippets: [
      'PASS sync-push-compat-metadata',
      'PASS sync-push-legacy-mutations-compatible',
      'PASS sync-push-outdated-client-rejected',
      'PASS sync-pull-outdated-client-rejected',
    ],
  },
  {
    id: 'production-build',
    description: 'Production build',
    command: 'npm run build',
    required: true,
  },
];

function runCheck(check) {
  process.stdout.write(`\n[ROLL-100] Running ${check.id}: ${check.description}\n`);
  const result = spawnSync('/bin/zsh', ['-lc', check.command], {
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const outputText = `${result.stdout || ''}\n${result.stderr || ''}`;
  const requiredOutputSnippets = Array.isArray(check.requiredOutputSnippets)
    ? check.requiredOutputSnippets
    : [];
  const missingSnippets = requiredOutputSnippets.filter(
    snippet => !outputText.includes(snippet),
  );

  const commandOk = result.status === 0;
  const outputOk = missingSnippets.length === 0;
  const ok = commandOk && outputOk;

  if (!outputOk) {
    process.stdout.write(
      `[ROLL-100] ${check.id} missing required output markers: ${missingSnippets.join(', ')}\n`,
    );
  }

  process.stdout.write(`[ROLL-100] ${check.id} => ${ok ? 'PASS' : 'FAIL'}\n`);
  return {
    ...check,
    ok,
    code: result.status ?? 1,
    missingSnippets,
    commandOk,
  };
}

const selectedChecks = checks.filter((item) => item.required);
const results = selectedChecks.map(runCheck);

const failed = results.filter((item) => !item.ok);
const passed = results.filter((item) => item.ok);

process.stdout.write('\n=== 100-Doctor Rollout Gate Summary ===\n');
process.stdout.write(`Mode: ${isQuick ? 'QUICK (no full integration test)' : 'FULL'}\n`);
process.stdout.write(`Passed: ${passed.length}\n`);
process.stdout.write(`Failed: ${failed.length}\n`);

if (failed.length > 0) {
  process.stdout.write('\nFailed checks:\n');
  for (const item of failed) {
    process.stdout.write(`- ${item.id} (${item.description})\n`);
    if (item.missingSnippets?.length) {
      process.stdout.write(`  missing markers: ${item.missingSnippets.join(', ')}\n`);
    }
  }
  process.stdout.write(
    '\nRollout gate is NOT ready for 100 active doctors. Fix failed checks and rerun.\n',
  );
  process.exit(1);
}

process.stdout.write(
  '\nRollout gate PASS. This build is ready for controlled 100-doctor rollout conditions.\n',
);
