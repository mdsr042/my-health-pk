import { getDesktopEnv, getMissingDesktopEnv } from './desktop-env.mjs';

const env = getDesktopEnv(process.cwd());
const missing = getMissingDesktopEnv(env);
const apiBase = `http://127.0.0.1:${env.API_PORT || 4001}/api`;

const hardThresholds = {
  conflicts: Number(process.env.COHORT_MAX_CONFLICTS ?? 0),
  retryableFailures: Number(process.env.COHORT_MAX_RETRYABLE_FAILURES ?? 5),
  doctorsWithAttention: Number(process.env.COHORT_MAX_DOCTORS_WITH_ATTENTION ?? 10),
  doctorsOffline: Number(process.env.COHORT_MAX_DOCTORS_OFFLINE ?? 5),
};

function printLine(message = '') {
  process.stdout.write(`${message}\n`);
}

async function request(path, init = {}, token = '') {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
}

function getStatus(summary) {
  const reasons = [];

  if (Number(summary?.conflicts ?? 0) > hardThresholds.conflicts) {
    reasons.push(
      `conflicts=${summary.conflicts} exceeds max=${hardThresholds.conflicts}`,
    );
  }

  if (Number(summary?.retryableFailures ?? 0) > hardThresholds.retryableFailures) {
    reasons.push(
      `retryableFailures=${summary.retryableFailures} exceeds max=${hardThresholds.retryableFailures}`,
    );
  }

  if (Number(summary?.doctorsWithAttention ?? 0) > hardThresholds.doctorsWithAttention) {
    reasons.push(
      `doctorsWithAttention=${summary.doctorsWithAttention} exceeds max=${hardThresholds.doctorsWithAttention}`,
    );
  }

  if (Number(summary?.doctorsOffline ?? 0) > hardThresholds.doctorsOffline) {
    reasons.push(
      `doctorsOffline=${summary.doctorsOffline} exceeds max=${hardThresholds.doctorsOffline}`,
    );
  }

  return {
    decision: reasons.length === 0 ? 'GO' : 'NO_GO',
    reasons,
  };
}

async function main() {
  if (missing.length > 0) {
    printLine(`Missing desktop environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    }),
  });

  if (!login.response.ok || !login.body?.token) {
    printLine('Failed to authenticate as admin for cohort health summary.');
    printLine(JSON.stringify(login.body || {}, null, 2));
    process.exit(1);
  }

  const stats = await request('/admin/offline-sync/stats?limit=300', {}, login.body.token);
  if (!stats.response.ok || !stats.body?.data?.summary) {
    printLine('Failed to fetch offline sync stats from admin endpoint.');
    printLine(JSON.stringify(stats.body || {}, null, 2));
    process.exit(1);
  }

  const summary = stats.body.data.summary;
  const evaluation = getStatus(summary);

  printLine('=== Pilot Cohort Health Summary ===');
  printLine(`Generated At: ${stats.body.data.generatedAt}`);
  printLine(`Decision: ${evaluation.decision}`);
  printLine(`Doctors: ${summary.doctors}`);
  printLine(`Active Devices: ${summary.activeDevices}/${summary.totalDevices}`);
  printLine(`Doctors With Attention: ${summary.doctorsWithAttention}`);
  printLine(`Doctors Offline: ${summary.doctorsOffline}`);
  printLine(`Conflicts: ${summary.conflicts}`);
  printLine(`Retryable Failures: ${summary.retryableFailures}`);
  printLine(`Last Synced At: ${summary.lastSyncedAt || 'N/A'}`);
  printLine('');
  printLine('Thresholds');
  printLine(`- max conflicts: ${hardThresholds.conflicts}`);
  printLine(`- max retryable failures: ${hardThresholds.retryableFailures}`);
  printLine(`- max doctors with attention: ${hardThresholds.doctorsWithAttention}`);
  printLine(`- max doctors offline: ${hardThresholds.doctorsOffline}`);

  if (evaluation.reasons.length > 0) {
    printLine('');
    printLine('NO_GO Reasons');
    for (const reason of evaluation.reasons) {
      printLine(`- ${reason}`);
    }
    process.exit(1);
  }

  printLine('');
  printLine('GO: Pilot cohort health is within rollout thresholds.');
}

main().catch((error) => {
  printLine(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
