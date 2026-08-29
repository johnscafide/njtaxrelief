import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || '';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runFullBuild() {
  const result = spawnSync(npmCommand, ['run', 'vercel-build:full'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Vercel's Node function builder can invoke the package-level `vercel-build`
// hook once per function. Watchdog has many functions, while this preparation
// work is repository-wide and only needs to happen once for an immutable
// deployment. VERCEL_DEPLOYMENT_ID keeps the marker isolated to one deployment.
// If that system variable is unavailable, fail safe by running the full build
// rather than risking a stale build-cache marker from a different deployment.
if (!deploymentId) {
  console.log('Watchdog build: deployment id unavailable; running the full preparation safely.');
  runFullBuild();
  process.exit(0);
}

const marker = join(
  process.cwd(),
  'node_modules',
  '.cache',
  'watchdog',
  `vercel-build-${deploymentId}.done`
);

if (existsSync(marker)) {
  console.log(`Watchdog build: repository preparation already completed for ${deploymentId}; skipping duplicate function-builder invocation.`);
  process.exit(0);
}

console.log(`Watchdog build: first preparation pass for ${deploymentId}.`);
runFullBuild();
mkdirSync(dirname(marker), { recursive: true });
writeFileSync(marker, `${new Date().toISOString()}\n`, 'utf8');
console.log(`Watchdog build: repository preparation completed for ${deploymentId}.`);
