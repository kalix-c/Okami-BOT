import { AsuraScraper } from '../src/scraper/sources/asura.js';
import { MangaSwatScraper } from '../src/scraper/sources/mangaswat.js';
import { TeamXScraper } from '../src/scraper/sources/teamx.js';
import { AzoraScraper } from '../src/scraper/sources/azora.js';

const query = process.argv.slice(2).join(' ') || 'Solo Leveling';
const scrapers = [
  new AsuraScraper(),
  new MangaSwatScraper(),
  new TeamXScraper(),
  new AzoraScraper(),
];

console.log(JSON.stringify({
  diagnostic: 'live-source-search',
  query,
  allowMockData: process.env.ALLOW_MOCK_DATA || 'unset',
  startedAt: new Date().toISOString(),
}, null, 2));

const results = [];
for (const scraper of scrapers) {
  const started = Date.now();
  try {
    const found = await scraper.search(query);
    results.push({
      source: scraper.sourceName,
      status: 'ok',
      elapsedMs: Date.now() - started,
      count: Array.isArray(found) ? found.length : 0,
      sample: Array.isArray(found) && found[0]
        ? { title: found[0].title, url: found[0].url, thumbnail: found[0].thumbnail }
        : null,
    });
  } catch (error) {
    results.push({
      source: scraper.sourceName,
      status: 'failed',
      elapsedMs: Date.now() - started,
      error: error.message,
    });
  }
}

console.log(JSON.stringify({ completedAt: new Date().toISOString(), results }, null, 2));

const failures = results.filter((result) => result.status !== 'ok').length;
process.exitCode = failures > 0 ? 1 : 0;
