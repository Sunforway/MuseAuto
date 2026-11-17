// Token Radar entry point. Node 22, standard library only.
//
// What it does, in order:
//   1. Read the sealed snapshot (758 protocols, 40 on the watchlist).
//   2. Score every pre-token protocol with the model in lib/model.ts.
//   3. Write the ranked board to board.json and the dashboard data to data.js.
//   4. Copy dashboard/ and screenshots/ beside them.
//   5. Write dossier.json last, because the scorer rebuilds it from the
//      finished output directory and compares the bytes.
//
// Run it outside the grader's container with MAKEFUN_OUTPUT_DIR standing
// in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Exit codes: 0 when the run completes, 1 when the board or the screenshots
// fail the gate, 2 when the snapshot cannot be found or read.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue as findBoardProblem,
  buildRadar as scoreProtocols,
  dataScript as renderRadarScript,
  parseSnapshot as readSnapshot,
} from './lib/model.ts';
import { buildDossier as renderDossier } from './vendor/makefun-board.ts';

const entryDir = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps, from reference/gate.json. */
const DOSSIER_TEXT_LIMIT = 65_536;
const SCREENSHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const SCREENSHOT_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_BOARD_ROWS = 100;

/** Print a message to stderr and stop with the given exit code. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** The value of a `--name <value>` or `--name=<value>` flag, or its fallback. */
function flagValue(flag: string, fallback: string): string {
  const args = process.argv;
  const spaced = args.indexOf(`--${flag}`);
  if (spaced >= 0 && spaced + 1 < args.length) return args[spaced + 1]!;
  const joined = args.find((item) => item.startsWith(`--${flag}=`));
  if (joined === undefined) return fallback;
  return joined.slice(flag.length + 3);
}

/** Turn an --input argument into the snapshot file: a .json file itself, or snapshot.json inside a directory. */
function resolveSnapshotFile(inputArg: string): string {
  return inputArg.endsWith('.json') ? inputArg : path.join(inputArg, 'snapshot.json');
}

/** Copy one directory's regular files into `target`, skipping dotfiles. Returns the names copied. */
function copyDirectoryFiles(source: string, target: string): string[] {
  if (!fs.existsSync(source)) return [];
  fs.mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const name of fs.readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const sourcePath = path.join(source, name);
    if (!fs.statSync(sourcePath).isFile()) continue;
    fs.copyFileSync(sourcePath, path.join(target, name));
    copied.push(name);
  }
  return copied;
}

/** The gate wants 3 or 4 screenshots with safe names. Refuse anything else. */
function checkScreenshots(names: string[]): void {
  if (names.length < 3) {
    fail(
      `screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of names) {
    if (!SCREENSHOT_NAME_PATTERN.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }
}

/** The two lines the run always prints, plus the top and bottom of the board. */
function printRunSummary(outputDir: string, protocolCount: number, watchlistCount: number, rows: { name: string; implied_value_usd: number }[], earlyCount: number, liveCount: number, imageCount: number): void {
  const best = rows[0]!;
  const last = rows[rows.length - 1]!;
  const dossierPath = path.join(outputDir, 'dossier.json');
  const dossierBytes = fs.statSync(dossierPath).size;
  process.stdout.write(
    `token radar: ${protocolCount} protocols, ${watchlistCount} on the watchlist, ${rows.length} rows scored (${earlyCount} early, ${liveCount} live set aside)\n` +
      `token radar: wrote ${path.join(outputDir, 'board.json')}, ${path.join(outputDir, 'data.js')}, ${path.join(outputDir, 'dashboard')} (3 files), ${path.join(outputDir, 'screenshots')} (${imageCount} images) and ${dossierPath}\n` +
      `token radar: top protocol ${best.name} at $${best.implied_value_usd.toLocaleString('en-US')} implied value, lowest $${last.implied_value_usd.toLocaleString('en-US')}, dossier ${dossierBytes.toLocaleString('en-US')} bytes\n`,
  );
}

function main(): void {
  const inputArg = flagValue('input', '/input');
  const snapshotFile = resolveSnapshotFile(inputArg);
  if (!fs.existsSync(snapshotFile)) {
    fail(`no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = readSnapshot(fs.readFileSync(snapshotFile, 'utf8'));
  if (!Array.isArray(snapshot.protocols) || snapshot.protocols.length === 0) {
    fail(`snapshot at ${snapshotFile} holds no protocols`, 2);
  }
  if (!Array.isArray(snapshot.watchlist) || snapshot.watchlist.length === 0) {
    fail(`snapshot at ${snapshotFile} holds no watchlist`, 2);
  }

  const { board, radar } = scoreProtocols(snapshot);
  if (board.length < MIN_BOARD_ROWS) {
    fail(`the model scored ${board.length} rows: the gate wants at least ${MIN_BOARD_ROWS}`, 1);
  }
  const problem = findBoardProblem(board, snapshot);
  if (problem !== null) {
    fail(`the model wrote a board the gate refuses: ${problem}`, 1);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  fs.writeFileSync(path.join(outputDir, 'data.js'), renderRadarScript(radar));

  copyDirectoryFiles(path.join(entryDir, 'dashboard'), path.join(outputDir, 'dashboard'));
  const shots = copyDirectoryFiles(path.join(entryDir, 'screenshots'), path.join(outputDir, 'screenshots'));
  checkScreenshots(shots);

  // The dossier is written last: the scorer rebuilds it from this output and compares bytes.
  fs.writeFileSync(
    path.join(outputDir, 'dossier.json'),
    renderDossier(outputDir, {
      text_max_bytes: DOSSIER_TEXT_LIMIT,
      screenshots: SCREENSHOT_LIMITS,
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );

  printRunSummary(outputDir, snapshot.protocols.length, snapshot.watchlist.length, board, radar.early_size, radar.live_size, shots.length);
}

main();
