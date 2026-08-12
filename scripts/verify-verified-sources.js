import assert from 'node:assert/strict';
import { config } from '../src/config/config.js';
import scraperEngine from '../src/modules/scraper.js';
import { FacebookPublisher } from '../src/modules/publisher.js';

const query = process.argv.slice(2).join(' ') || 'Solo Leveling';
const report = { query, checks: [], startedAt: new Date().toISOString() };

try {
  assert.equal(config.scraping.allowMockData, false, 'يجب أن تكون البيانات التجريبية معطلة.');
  assert.deepEqual(config.sources.map((source) => source.id), ['anilist'], 'يجب أن تكون المصادر المتاحة موثقة فقط.');
  report.checks.push({ name: 'configuration', passed: true });

  const results = await scraperEngine.searchAll(query);
  assert.ok(results.length > 0, 'لم يعثر المصدر الموثق على نتيجة حقيقية.');
  assert.equal(results[0].sourceId, 'anilist');
  assert.equal(results[0].metadataOnly, true);
  report.checks.push({ name: 'real-search', passed: true, sample: results[0] });

  const details = await scraperEngine.getMangaDetails(results[0].sourceId, results[0].url);
  assert.ok(details.title);
  assert.equal(details.metadataOnly, true);
  assert.deepEqual(details.chapters, []);
  report.checks.push({
    name: 'real-metadata',
    passed: true,
    details: {
      title: details.title,
      status: details.status,
      totalChapters: details.totalChapters,
      sourceUrl: details.sourceUrl
    }
  });

  let imageGuarded = false;
  try {
    await scraperEngine.parseChapterImages('anilist', results[0].url);
  } catch (error) {
    imageGuarded = /بيانات وصفية فقط/.test(error.message);
  }
  assert.equal(imageGuarded, true, 'يجب منع جلب صور الفصول من مصدر البيانات الوصفية.');
  report.checks.push({ name: 'image-publishing-guard', passed: true });

  const publisherStatus = await FacebookPublisher.validateToken();
  assert.equal(typeof publisherStatus.valid, 'boolean');
  report.checks.push({ name: 'page-publisher-config-guard', passed: true, configured: publisherStatus.valid });

  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.error = error.message;
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
