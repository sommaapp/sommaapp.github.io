#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '2.118.0';
const packageName = '@supabase/supabase-js';
const expectedSha256 = 'ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3';
const expectedIntegrity = 'sha512-FxI8UXMVC2UG7IkeiI8fuQZqq2oI3JeSuN8MPIC2RLVaoEAxKS0nqE6kii9Ewpq8f9gNPM6git1Y8f0vN/QLFw==';
const sha256 = content => createHash('sha256').update(content).digest('hex');

let checkOnly = false;
let targetDirectory = resolve(toolingRoot, '..', 'vendor');
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--check') checkOnly = true;
  else if (argument === '--target-dir' && process.argv[index + 1]) {
    targetDirectory = resolve(process.cwd(), process.argv[++index]);
  } else if (argument === '--help') {
    console.log('Usage: node scripts/vendor-supabase.mjs [--check] [--target-dir DIRECTORY]');
    console.log('Default target: ../vendor relative to tooling/. No network access or build scripts.');
    process.exit(0);
  } else {
    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
}

const project = JSON.parse(await readFile(resolve(toolingRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(toolingRoot, 'package-lock.json'), 'utf8'));
const sdkLock = lock.packages?.[`node_modules/${packageName}`];
if (project.devDependencies?.[packageName] !== version
    || sdkLock?.version !== version
    || sdkLock.integrity !== expectedIntegrity) {
  throw new Error('SDK pin or lock integrity differs. Review the dependency update before changing this script.');
}

const sdkRoot = resolve(toolingRoot, 'node_modules', packageName);
const sdkPackage = JSON.parse(await readFile(resolve(sdkRoot, 'package.json'), 'utf8'));
if (sdkPackage.version !== version) throw new Error('Installed SDK version differs. Run npm ci --ignore-scripts.');
const bundleSource = 'dist/umd/supabase.js';
const bundle = await readFile(resolve(sdkRoot, bundleSource));
if (sha256(bundle) !== expectedSha256) throw new Error('Official UMD bundle checksum does not match the reviewed version.');
const sdkLicense = await readFile(resolve(sdkRoot, 'LICENSE'));

// Keep test tools out of the distributed SDK notices. Follow only the
// dependency closure of the pinned Supabase package in npm's lockfile.
function resolveDependency(parentPath, dependencyName) {
  let ancestor = parentPath;
  for (;;) {
    const candidate = `${ancestor}/node_modules/${dependencyName}`;
    if (lock.packages[candidate]) return candidate;
    const parentBoundary = ancestor.lastIndexOf('/node_modules/');
    if (parentBoundary < 0) break;
    ancestor = ancestor.slice(0, parentBoundary);
  }
  const hoisted = `node_modules/${dependencyName}`;
  return lock.packages[hoisted] ? hoisted : null;
}

const sdkDependencyPaths = new Set();
const pending = [`node_modules/${packageName}`];
while (pending.length > 0) {
  const packagePath = pending.pop();
  if (sdkDependencyPaths.has(packagePath)) continue;
  sdkDependencyPaths.add(packagePath);
  const locked = lock.packages[packagePath];
  for (const dependencyName of Object.keys(locked.dependencies ?? {})) {
    const dependencyPath = resolveDependency(packagePath, dependencyName);
    if (!dependencyPath) throw new Error(`Missing locked dependency: ${dependencyName}`);
    pending.push(dependencyPath);
  }
  for (const dependencyName of Object.keys(locked.optionalDependencies ?? {})) {
    const dependencyPath = resolveDependency(packagePath, dependencyName);
    if (dependencyPath) pending.push(dependencyPath);
  }
}

const dependencies = [];
const noticeSections = [
  `Somma: third-party notices for ${packageName}@${version}.`,
  'This file preserves the license texts of the SDK and every package in its locked dependency tree.',
  'Some packages or features may not be exercised by the browser application.',
  'Generated from official npm packages by tooling/scripts/vendor-supabase.mjs.\n'
];

for (const packagePath of [...sdkDependencyPaths].sort((a, b) => a.localeCompare(b, 'en'))) {
  const locked = lock.packages[packagePath];
  const installedRoot = resolve(toolingRoot, packagePath);
  const installed = JSON.parse(await readFile(resolve(installedRoot, 'package.json'), 'utf8'));
  if (installed.version !== locked.version) throw new Error(`Version mismatch for ${installed.name}. Run npm ci --ignore-scripts.`);
  if (!locked.resolved?.startsWith('https://registry.npmjs.org/')) {
    throw new Error(`Unexpected package registry for ${installed.name}.`);
  }
  const files = (await readdir(installedRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(entry.name))
    .map(entry => entry.name).sort();
  if (files.length === 0) throw new Error(`No distributed license text found for ${installed.name}.`);
  const licenseFiles = [];
  noticeSections.push(`===== ${installed.name}@${installed.version} =====`, `License: ${installed.license}`, `Package: ${locked.resolved}`);
  for (const filename of files) {
    const license = await readFile(resolve(installedRoot, filename));
    noticeSections.push(`Source file: ${filename}\n`, license.toString('utf8'), '');
    licenseFiles.push({ filename, sha256: sha256(license) });
  }
  dependencies.push({
    name: installed.name,
    version: installed.version,
    license: installed.license,
    resolved: locked.resolved,
    integrity: locked.integrity,
    licenseFiles
  });
}

const basename = `supabase-${version}`;
const notices = Buffer.from(`${noticeSections.join('\n')}\n`, 'utf8');
const provenance = {
  package: packageName,
  version,
  packageTarball: sdkLock.resolved,
  packageIntegrity: sdkLock.integrity,
  upstreamFile: bundleSource,
  vendoredFile: `${basename}.min.js`,
  bytes: bundle.length,
  sha256: expectedSha256,
  licenseFile: `${basename}.LICENSE.txt`,
  licenseSha256: sha256(sdkLicense),
  noticesFile: `${basename}.NOTICES.txt`,
  noticesSha256: sha256(notices),
  generatedBy: 'tooling/scripts/vendor-supabase.mjs',
  dependencies
};
const outputs = new Map([
  [`${basename}.min.js`, bundle],
  [`${basename}.LICENSE.txt`, sdkLicense],
  [`${basename}.NOTICES.txt`, notices],
  [`${basename}.PROVENANCE.json`, Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`, 'utf8')]
]);

if (!checkOnly) await mkdir(targetDirectory, { recursive: true });
for (const [filename, content] of outputs) {
  const target = resolve(targetDirectory, filename);
  if (checkOnly) {
    let current;
    try { current = await readFile(target); }
    catch { throw new Error(`Missing vendor file: ${target}`); }
    if (!current.equals(content)) throw new Error(`Vendor file differs from the pinned package: ${target}`);
  } else {
    await writeFile(target, content);
  }
}
console.log(`${checkOnly ? 'Verified' : 'Copied'} ${packageName}@${version}: ${bundle.length} bytes, SHA-256 ${expectedSha256}`);
console.log(`Preserved ${dependencies.length} package licenses in ${targetDirectory}`);
