// One-off script: fetch real player headshots from Wikipedia and write a
// `photoUrl` field into server/data/players.json.
//
// Usage:
//   node server/scripts/fetchPhotos.js            # fetch only players missing photoUrl
//   node server/scripts/fetchPhotos.js --force     # re-fetch everyone
//   node server/scripts/fetchPhotos.js --only=p24,p64
//
// No API key, no dependencies — uses Node's native fetch. Rate-limited and
// batched to be polite to Wikimedia. Failures are recorded (not thrown) so
// the run always completes; see server/data/photos-report.json afterward.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLAYERS_FILE = path.join(__dirname, '..', 'data', 'players.json');
const PLAYERS_TMP_FILE = path.join(__dirname, '..', 'data', 'players.json.tmp');
const REPORT_FILE = path.join(__dirname, '..', 'data', 'photos-report.json');

const USER_AGENT = 'IPLMegaRoom/1.0 (local dev script; personal project)';
const RATE_LIMIT_MS = 600;
const RATE_LIMIT_BACKOFF_MS = 20000;
const MAX_RETRIES = 4;
const THUMB_SIZE = 400;

// Known lookups that don't resolve cleanly from the raw `name` field —
// disambiguation pages, common names shared with celebrities, or names
// spelled differently on Wikipedia than in our data.
const NAME_OVERRIDES = {
  p2: 'MS Dhoni',
  p24: 'Varun Chakravarthy',
  p64: 'Bhuvneshwar Kumar',
  p65: 'T. Natarajan (cricketer)',
  p75: 'Shahrukh Khan (cricketer)',
  p80: 'R. Sai Kishore',
};

function parseArgs(argv) {
  const force = argv.includes('--force');
  const onlyArg = argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
  return { force, only };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wikimedia's anonymous rate limiter replies with a plain-text body (not
// JSON) and still a 200 status, so it can only be detected by trying to
// parse the response and checking the text on failure. Retries with an
// exponential-ish backoff rather than treating it as a permanent miss.
async function fetchJsonWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (/too many requests/i.test(text) && attempt < MAX_RETRIES) {
        const wait = RATE_LIMIT_BACKOFF_MS * (attempt + 1);
        console.log(`  (rate limited, backing off ${wait / 1000}s...)`);
        await sleep(wait);
        continue;
      }
      throw new Error(`Non-JSON response: ${text.slice(0, 120)}`);
    }
  }
  throw new Error('Exceeded retries after repeated rate limiting');
}

async function wikiQuery(titles) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', String(THUMB_SIZE));
  url.searchParams.set('redirects', '1');
  url.searchParams.set('titles', titles.join('|'));

  const data = await fetchJsonWithRetry(url);
  return data.query || {};
}

async function wikiSearch(query) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', '1');

  const data = await fetchJsonWithRetry(url);
  return data.query?.search?.[0]?.title || null;
}

// Resolve one candidate title to a thumbnail URL, or null if no image found.
function extractThumb(queryResult, wantedTitle) {
  const pages = queryResult.pages || {};
  const normalized = queryResult.normalized || [];
  const redirects = queryResult.redirects || [];

  // Find the canonical title this request ended up mapping to.
  let canonical = wantedTitle;
  const norm = normalized.find(n => n.from === wantedTitle);
  if (norm) canonical = norm.to;
  const redir = redirects.find(r => r.from === canonical);
  if (redir) canonical = redir.to;

  for (const page of Object.values(pages)) {
    if (page.title === canonical || page.title === wantedTitle) {
      if (page.missing !== undefined) return null;
      return page.thumbnail?.source || null;
    }
  }
  // Fall back to the only page returned, if there's exactly one.
  const all = Object.values(pages);
  if (all.length === 1 && all[0].missing === undefined) {
    return all[0].thumbnail?.source || null;
  }
  return null;
}

async function resolvePlayerPhoto(player) {
  const triedTitles = [];
  const override = NAME_OVERRIDES[player.id];
  const candidates = override
    ? [override]
    : [`${player.name} (cricketer)`, player.name];

  for (const title of candidates) {
    triedTitles.push(title);
    try {
      const result = await wikiQuery([title]);
      const thumb = extractThumb(result, title);
      if (thumb) return { photoUrl: thumb, triedTitles, via: title };
    } catch (err) {
      // network hiccup on this candidate — try the next one
    }
    await sleep(RATE_LIMIT_MS);
  }

  // Last resort: full-text search, then look up whatever it finds.
  try {
    const searchTitle = await wikiSearch(`${player.name} cricketer`);
    if (searchTitle) {
      triedTitles.push(searchTitle);
      const result = await wikiQuery([searchTitle]);
      const thumb = extractThumb(result, searchTitle);
      if (thumb) return { photoUrl: thumb, triedTitles, via: searchTitle };
    }
  } catch (err) {
    // give up
  }

  return { photoUrl: null, triedTitles, via: null };
}

async function main() {
  const { force, only } = parseArgs(process.argv.slice(2));
  const players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf-8'));

  const targets = players.filter(p => {
    if (only) return only.has(p.id);
    if (force) return true;
    return !p.photoUrl;
  });

  console.log(`Fetching photos for ${targets.length} of ${players.length} players${force ? ' (--force)' : ''}...`);

  const report = { ok: [], failed: [] };

  for (let i = 0; i < targets.length; i++) {
    const player = targets[i];
    const { photoUrl, triedTitles, via } = await resolvePlayerPhoto(player);
    player.photoUrl = photoUrl;

    if (photoUrl) {
      report.ok.push({ id: player.id, name: player.name, via, photoUrl });
      console.log(`[${i + 1}/${targets.length}] OK   ${player.name} -> ${via}`);
    } else {
      report.failed.push({ id: player.id, name: player.name, triedTitles });
      console.log(`[${i + 1}/${targets.length}] MISS ${player.name} (tried: ${triedTitles.join(', ')})`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  fs.writeFileSync(PLAYERS_TMP_FILE, JSON.stringify(players, null, 2), 'utf-8');
  fs.renameSync(PLAYERS_TMP_FILE, PLAYERS_FILE);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\nDone. ${report.ok.length} ok, ${report.failed.length} failed.`);
  console.log(`Report written to ${REPORT_FILE}`);
  if (report.failed.length > 0) {
    console.log('Failed players will fall back to the DiceBear avatar in the UI.');
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
