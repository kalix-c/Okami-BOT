import logger from '../utils/logger.js';
import cacheService from '../services/cacheService.js';
import pLimit from 'p-limit';
import { AniListScraper } from './sources/anilist.js';

class ScraperManager {
    constructor() {
        this.scrapers = {
            anilist: new AniListScraper()
        };
        this.limit = pLimit(2);
    }

    getSource(sourceId) {
        const scraper = this.scrapers[String(sourceId || '').toLowerCase()];
        if (!scraper) {
            throw new Error(`مصدر غير مدعوم أو غير موثق: ${sourceId}`);
        }
        return scraper;
    }

    async search(query) {
        const normalizedQuery = String(query || '').trim();
        if (!normalizedQuery) {
            return { success: false, total: 0, results: [], details: [], error: 'أدخل عنوانًا صالحًا للبحث.' };
        }

        const cacheKey = `search:${normalizedQuery.toLowerCase()}`;
        const cachedResults = await cacheService.get(cacheKey);
        if (cachedResults) {
            logger.info(`[ScraperManager] Cache hit for: ${normalizedQuery}`);
            return cachedResults;
        }

        const responses = await Promise.all(
            Object.values(this.scrapers).map((scraper) => this.limit(async () => {
                try {
                    const results = await scraper.search(normalizedQuery);
                    return { success: true, source: scraper.sourceName, results };
                } catch (error) {
                    logger.error(`[ScraperManager] Search failed for ${scraper.sourceName}: ${error.message}`);
                    return { success: false, source: scraper.sourceName, error: error.message, results: [] };
                }
            }))
        );

        const allResults = responses.flatMap((result) => result.results);
        const finalResult = {
            success: allResults.length > 0,
            total: allResults.length,
            results: allResults,
            details: responses.map(({ source, success, results, error }) => ({
                source,
                count: results.length,
                success,
                error: error || null
            })),
            error: allResults.length ? null : 'لم تتوفر نتائج حقيقية من المصادر الموثقة.',
            timestamp: new Date().toISOString()
        };

        if (allResults.length > 0) {
            await cacheService.set(cacheKey, finalResult, 'anilist');
        }

        return finalResult;
    }

    async getDetails(sourceId, url) {
        const scraper = this.getSource(sourceId);
        const cacheKey = `details:${sourceId}:${url}`;
        const cachedDetails = await cacheService.get(cacheKey);
        if (cachedDetails) {
            logger.info(`[ScraperManager] Cache hit for details: ${url}`);
            return cachedDetails;
        }

        try {
            const info = await scraper.getMangaInfo(url);
            const chapters = await scraper.getChapters(url);
            const result = { success: true, source: sourceId, info, chapters };
            await cacheService.set(cacheKey, result, sourceId);
            return result;
        } catch (error) {
            logger.error(`[ScraperManager] Details failed for ${sourceId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async getChapterImages(sourceId, url) {
        const scraper = this.getSource(sourceId);
        try {
            const images = await scraper.getChapterImages(url);
            return { success: true, source: sourceId, images };
        } catch (error) {
            logger.error(`[ScraperManager] Image retrieval failed for ${sourceId}: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async closeAll() {
        await Promise.all(Object.values(this.scrapers).map((scraper) => scraper.close()));
    }
}

export const scraperManager = new ScraperManager();
