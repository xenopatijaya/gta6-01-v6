// Porto Alba — make.fun gta6-01 entry program (Node 22, standard library only).
//
// It assembles /output from this repository: the whole game/ folder, the
// screenshots/ folder, and a dossier.json written by the vendored make.fun
// library (vendor/makefun-game.ts). Run it twice and the bytes must match.
//
//   MAKEFUN_OUTPUT_DIR=/tmp/gta6-01-v6-out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps for this bounty: game/ at most 993 files and
// 48 MiB, screenshots at most 4 files of 256 KiB each, dossier text capped
// at 160 KiB. The program refuses to write an entry the scorer would refuse.
const CAPS = {
  textMaxBytes: 163840,
  screenshotMax: 4,
  screenshotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
};

function repoRoot() {
  return dirname(fileURLToPath(import.meta.url));
}

function outputDir() {
  return resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

// Total bytes under a directory, walked recursively (files only).
function treeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += treeBytes(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

function main() {
  const root = repoRoot();
  const out = outputDir();
  const gameDir = join(root, 'game');
  const shotsDir = join(root, 'screenshots');

  if (!existsSync(gameDir)) throw new Error('missing game/ next to main.ts');
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('missing game/index.html');

  // Start from a clean output directory so a stale file can never leak in.
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
  }

  const dossier = buildDossier(out, {
    text_max_bytes: CAPS.textMaxBytes,
    screenshots: { max: CAPS.screenshotMax, max_bytes: CAPS.screenshotMaxBytes },
    game_max_files: CAPS.gameMaxFiles,
    game_max_bytes: CAPS.gameMaxBytes,
    game_path_max_bytes: CAPS.gamePathMaxBytes,
  });
  writeFileSync(join(out, 'dossier.json'), dossier);

  const dossierBytes = statSync(join(out, 'dossier.json')).size;
  const gameBytes = treeBytes(join(out, 'game'));
  const shotCount = readdirSync(join(out, 'screenshots')).length;
  console.log(`Porto Alba entry written to ${out}`);
  console.log(`game/ bytes: ${gameBytes}, screenshots: ${shotCount}, dossier.json bytes: ${dossierBytes}`);
}

main();
