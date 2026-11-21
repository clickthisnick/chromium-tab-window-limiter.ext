import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Official actionlint release. Dependabot does not bump this pin.
const ACTIONLINT_VERSION = '1.7.12';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, '.tools');
const binDir = path.join(tools, 'bin');
const pyDir = path.join(tools, 'py');

/** @type {Record<string, string | undefined>} */
const osNames = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
/** @type {Record<string, string | undefined>} */
const archNames = { x64: 'amd64', arm64: 'arm64' };
const osName = osNames[process.platform];
const archName = archNames[process.arch];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  }
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} for ${url}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function actionlintReady() {
  const binary = path.join(binDir, process.platform === 'win32' ? 'actionlint.exe' : 'actionlint');
  const result = spawnSync(binary, ['-version'], { encoding: 'utf8' });
  return result.status === 0 && `${result.stdout}${result.stderr}`.includes(ACTIONLINT_VERSION);
}

function codespellReady() {
  const result = spawnSync('python3', ['-m', 'codespell_lib', '--version'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: pyDir },
  });
  return result.status === 0 && result.stdout.includes('2.');
}

async function installActionlint() {
  if (!osName || !archName) {
    throw new Error(`unsupported platform ${process.platform} ${process.arch}`);
  }
  if (actionlintReady()) {
    return;
  }
  const ext = osName === 'windows' ? 'zip' : 'tar.gz';
  const asset = `actionlint_${ACTIONLINT_VERSION}_${osName}_${archName}.${ext}`;
  const base = `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}`;
  const [archive, checksumText] = await Promise.all([
    download(`${base}/${asset}`),
    download(`${base}/actionlint_${ACTIONLINT_VERSION}_checksums.txt`).then((buf) =>
      buf.toString('utf8'),
    ),
  ]);
  const line = checksumText.split('\n').find((item) => item.trim().endsWith(asset));
  if (!line) {
    throw new Error(`checksum list has no ${asset}`);
  }
  const expected = line.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== expected) {
    throw new Error(`actionlint checksum mismatch for ${asset}`);
  }
  const extractDir = path.join(tools, 'actionlint-extract');
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  const archivePath = path.join(extractDir, asset);
  await writeFile(archivePath, archive);
  run('tar', ['-xf', archivePath, '-C', extractDir]);
  await mkdir(binDir, { recursive: true });
  const binaryName = process.platform === 'win32' ? 'actionlint.exe' : 'actionlint';
  const binary = path.join(binDir, binaryName);
  await rm(binary, { force: true });
  await rename(path.join(extractDir, binaryName), binary);
  await chmod(binary, 0o755);
  await rm(extractDir, { recursive: true, force: true });
  if (!actionlintReady()) {
    throw new Error('actionlint did not report the pinned version');
  }
}

function installCodespell() {
  if (codespellReady()) {
    return;
  }
  run('python3', [
    '-m',
    'pip',
    'install',
    '--disable-pip-version-check',
    '--target',
    pyDir,
    '-r',
    path.join(root, 'requirements.txt'),
  ]);
  if (!codespellReady()) {
    throw new Error('codespell did not run after install');
  }
}

await mkdir(tools, { recursive: true });
await installActionlint();
installCodespell();
console.log('check tools ready');
