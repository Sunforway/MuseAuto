// The token radar's model, radar-2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// the highest-scoring eligible pre-token protocols: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// radar-2.1 adds one eligibility screen to the board (isRankable): a row must be a protocol that
// could plausibly launch a new token. Bridges, staking products, exchanges, versioned pools, and
// wrapped or staked products of a token that already trades are out, because the board ranks launches,
// not venues or wrappers. The screen leaves 197 eligible protocols in this snapshot, so the board
// carries 197 rows (40 watchlist + 157 early); the TVL floor no longer limits the early rows.
// The model itself (MODEL, impliedValue) is unchanged from radar-2.
//
// Implied value follows only from the snapshot's own figures, and every factor is stated below:
//
//   base     = BASE_USD x (tvl_usd / TVL_REF) ^ TVL_EXPONENT
//              TVL is log-compressed (exponent 0.45): a protocol with 2,760x the TVL scores ~12x the
//              base, not 2,760x. A token's market does not scale linearly with locked value.
//   growth   = clamp(change_7d, -30, +40) per cent; growthMult = 1 + growth/100 x GROWTH_WEIGHT.
//              The snapshot's growth runs about -17% to +11% (5th-95th pct), so a +-30/40 cap with
//              weight 1.0 actually differentiates momentum instead of capping nothing.
//   runway   = 0.78 + 0.22 x ageScore(age_days). ageScore rises 0.3 -> 1.0 over the first year (a
//              protocol must survive a while to be a credible launch), stays 1.0 from 1 to 2.5 years,
//              then fades to 0.5 by ~6.5 years (a protocol that has run that long with no token is
//              less likely ever to issue one). Unknown age uses 365 days.
//   chains   = 1 + 0.03 x min(chains - 1, 5): multi-chain deployment is stickier than single-chain.
//   category = 0.94..1.08 by how sticky the category's TVL is (lending and staking keep deposits;
//              yield farms rotate). A narrow band: the figures decide, the category only nudges.
//   implied  = max(1, round(base x growthMult x runwayMult x chainMult x categoryMult))
//
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_usd: number;
  tvl_ref_usd: number;
  tvl_exponent: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  runway_floor: number;
  runway_range: number;
  runway_peak_start: number;
  runway_peak_end: number;
  chain_step: number;
  chain_max_bonus: number;
}

export const MODEL: ModelConstants = {
  base_usd: 25_000_000,
  tvl_ref_usd: 50_000_000,
  tvl_exponent: 0.45,
  growth_weight: 1.0,
  growth_floor: -30,
  growth_cap: 40,
  unknown_age_days: 365,
  runway_floor: 0.78,
  runway_range: 0.22,
  runway_peak_start: 365,
  runway_peak_end: 900,
  chain_step: 0.03,
  chain_max_bonus: 0.15,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many eligible pre-token protocols the early radar carries, by model score. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    runway_multiplier: number;
    chain_multiplier: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  runway_multiplier: number;
  chain_multiplier: number;
  category_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Runway score 0..1 from age: rises over year one, flat to 900 days, then fades. */
export function ageScore(age: number | null, model: ModelConstants): number {
  const a = age ?? model.unknown_age_days;
  if (a <= 0) return 0.3;
  if (a < model.runway_peak_start) return 0.3 + (0.7 * a) / model.runway_peak_start;
  if (a <= model.runway_peak_end) return 1;
  return Math.max(0.5, 1 - (0.5 * (a - model.runway_peak_end)) / 1500);
}

/** Category stickiness multiplier, 0.94..1.08: how likely the category's TVL is to stay put. */
export function categoryMultiplier(p: SnapshotProtocol): number {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 1.08;
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('staking pool')) return 1.06;
  if (c.includes('restak')) return 1.06;
  if (c.includes('rwa')) return 1.06;
  if (c.includes('risk curator') || c.includes('capital allocator')) return 1.05;
  if (c.includes('dex') || c.includes('liquidity manager')) return 0.98;
  if (c.includes('bridge')) return 0.97;
  if (c.includes('yield') || c.includes('leveraged farm') || c === 'farm') return 0.94;
  return 1.0;
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; base: number; growthPct: number; growthMult: number; runwayMult: number; chainMult: number; catMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const runwayMult = model.runway_floor + model.runway_range * ageScore(age, model);
  const chainCount = Math.max(0, protocol.chains.length - 1);
  const chainMult = 1 + Math.min(model.chain_max_bonus, model.chain_step * chainCount);
  const catMult = categoryMultiplier(protocol);
  const tvl = Math.max(1, protocol.tvl_usd);
  const base = model.base_usd * Math.pow(tvl / model.tvl_ref_usd, model.tvl_exponent);
  const implied = Math.max(1, Math.round(base * growthMult * runwayMult * chainMult * catMult));
  return { implied, base, growthPct, growthMult, runwayMult, chainMult, catMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that cannot be a new token launch: bridges move value between chains, staking
 *  products wrap a token that already trades, and an exchange is a venue, not a launch. */
const INELIGIBLE_CATEGORIES = new Set([
  'bridge',
  'canonical bridge',
  'liquid staking',
  'liquid restaking',
  'restaked btc',
  'cex',
]);

/** A name that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_OR_STAKED = /wrapped|staked|staking/i;

/** A category name that still marks a bridge, wrapped, or staking product even when its exact
 *  category is not in the exclusion set (e.g. "Cross Chain Bridge", "Stablecoin Wrapper",
 *  "Staking Pool", "Restaking"). */
const BRIDGE_WRAP_STAKE_CATEGORY = /bridge|wrap|stak/i;

/** Exchange names: a protocol named after a trading venue is that venue's product, not a launch. */
const EXCHANGE_NAMES = [
  'binance',
  'coinbase',
  'bybit',
  'bitfinex',
  'bitget',
  'htx',
  'huobi',
  'okx',
  'kraken',
  'kucoin',
  'gemini',
  'robinhood',
  'bitstamp',
  'bitmart',
  'mexc',
  'gate',
  'crypto.com',
  'upbit',
  'lbank',
  'digifinex',
  'phemex',
  'bingx',
  'bitrue',
];

/** Whether a protocol is one the board may rank: pre-token, and eligible to launch a new token —
 *  not a bridge, a staking product, an exchange, a versioned pool, or a wrapped/staked product.
 *  The category check also catches near-miss names ("Cross Chain Bridge", "Stablecoin Wrapper",
 *  "Staking Pool", "Restaking") that the exact-category set misses. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (INELIGIBLE_CATEGORIES.has((p.category ?? '').toLowerCase())) return false;
  if (BRIDGE_WRAP_STAKE_CATEGORY.test(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  const name = p.name.toLowerCase();
  if (EXCHANGE_NAMES.some((exchange) => name.startsWith(exchange))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  // Score every rankable pre-token protocol once, by the model, not by raw TVL.
  const scoredAll = snapshot.protocols
    .filter(isRankable)
    .map((p) => {
      const s = impliedValue(p, snapshot.as_of, model);
      return { p, ...s };
    });
  const bySlugScore = new Map(scoredAll.map((s) => [s.p.slug, s]));
  const chosen = new Map<string, (typeof scoredAll)[number]>();
  // The watchlist is the floor: every slug is in, whatever its score.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p === undefined) continue;
    const s = bySlugScore.get(slug) ?? { p, ...impliedValue(p, snapshot.as_of, model) };
    chosen.set(slug, s);
  }
  // The early radar: the highest-scoring eligible pre-token protocols, by implied value.
  // The TVL floor no longer limits it: the eligibility screen leaves 197 protocols in this
  // snapshot, so the board takes every eligible protocol it can. Never a replacement for a
  // watchlist row.
  const early = scoredAll
    .filter((s) => !chosen.has(s.p.slug))
    .sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const s of early) chosen.set(s.p.slug, s);

  const scored = [...chosen.values()];
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_usd: Math.round(s.base),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      runway_multiplier: round4(s.runwayMult),
      chain_multiplier: round4(s.chainMult),
      category_multiplier: round4(s.catMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas for one transaction on the protocol's main chain, from the chains list. */
function gasFor(p: SnapshotProtocol): string {
  const main = (p.chains[0] ?? '').toLowerCase();
  if (main === 'ethereum') return '$8';
  if (main === 'bitcoin') return '$3';
  return '$2';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $20 of USDC against it and repay it the same week so both sides of the position are active.`;
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restak') || c.includes('staking pool')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain}, keep the receipt token, and deposit that receipt once into a lending market.`;
  if (c.includes('dex') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in the range the pool actually trades in, and check the range once a month.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm') || c === 'farm') return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and leave auto-compounding on so the position earns every week.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then spend the bridged funds once inside an app on ${chain} instead of bridging straight back.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain}, hold it through one full distribution cycle, and note the redemption window before you mint.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small hedge, and close it within a week so the account shows real use.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name}, place one position in a market that resolves within a month, and let it settle instead of cashing out early.`;
  if (c.includes('stable') || c.includes('algo-stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it through a full weekly cycle.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy until it expires.`;
  if (c.includes('risk curator') || c.includes('capital allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the whole qualifying window.`;
  if (c.includes('launchpad')) return `Stake $${capital} on ${name} on ${chain} to qualify for allocations, and join one sale if a slot opens.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the position is active every week, not once. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a small borrow and repay, or a top-up of the supply';
  if (c.includes('dex') || c.includes('liquidity manager')) return 'one swap through the pool, or a rebalance of the range';
  if (c.includes('liquid staking') || c.includes('liquid restaking') || c.includes('restak') || c.includes('staking pool')) return 'a claim of the staking rewards, then restake them';
  if (c.includes('bridge')) return 'one small bridge in either direction, used inside an app';
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm') || c === 'farm') return 'a check that compounding is still on, plus one harvest if the vault pays out';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return 'one small trade, closed the same week';
  if (c.includes('prediction')) return 'one position in a market that is still open';
  if (c.includes('rwa')) return 'a check of the next distribution date, and one top-up if a new tranche opens';
  return 'a deposit, a swap, a vote, or a claim of the rewards';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const weekly = weeklyActionFor(p);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under ${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as ${weekly}.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw and re-deposit to fake activity.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, checking the contract address matches its docs.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates, the chain and every transaction hash in a farm log, and plan the unwind before you enter: what you sell first and what gas the exit costs.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    runway_multiplier: row.model.runway_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    category_multiplier: row.model.category_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
