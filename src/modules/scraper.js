import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { scraperManager } from '../scraper/scraperManager.js';

export function extractChapterNumber(name) {
    if (!name) return 0;
    const cleanName = String(name).replace(/،/g, '.').replace(/,/g, '.');
    const match = cleanName.match(/(?:الفصل|chapter|ch|f)\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (match?.[1]) return Number.parseFloat(match[1]);

    const genericMatch = cleanName.match(/([0-9]+(?:\.[0-9]+)?)/);
    return genericMatch?.[1] ? Number.parseFloat(genericMatch[1]) : 0;
}

export class ScraperEngine {
    constructor() {
        this.sources = config.sources;
    }

    getSupportedSources() {
        return this.sources;
    }

    async searchAll(query) {
        logger.info(`[Scraper] Searching verified sources for: ${query}`);
        const result = await scraperManager.search(query);
        if (!result.success) {
            logger.warn(`[Scraper] No verified result for "${query}": ${result.error || 'unknown error'}`);
            return [];
        }

        return result.results.map((item) => ({
            title: item.title,
            url: item.url,
            sourceId: item.source,
            sourceName: item.sourceName,
            metadataOnly: Boolean(item.metadataOnly)
        }));
    }

    async search(sourceId, query) {
        logger.info(`[Scraper] Searching ${sourceId} for: ${query}`);
        const allResults = await this.searchAll(query);
        return allResults.filter((result) => result.sourceId === sourceId);
    }

    async getMangaDetails(sourceId, mangaUrl) {
        logger.info(`[Scraper] Getting verified details for ${mangaUrl}`);
        const result = await scraperManager.getDetails(sourceId, mangaUrl);
        if (!result.success) {
            throw new Error(result.error || 'فشل جلب بيانات حقيقية للعمل.');
        }

        const chapters = Array.isArray(result.chapters) ? result.chapters : [];
        const parsedFirst = chapters[0] ? extractChapterNumber(chapters[0].name) : 0;
        const parsedLast = chapters.at(-1) ? extractChapterNumber(chapters.at(-1).name) : 0;
        const isNewestFirst = chapters.length > 1 && parsedFirst > parsedLast;

        return {
            title: result.info.title,
            coverUrl: result.info.cover || '',
            description: result.info.description || '',
            status: result.info.status || 'UNKNOWN',
            sourceUrl: result.info.sourceUrl || mangaUrl,
            metadataOnly: result.info.publishingAllowed === false,
            totalChapters: result.info.totalChapters ?? null,
            totalVolumes: result.info.totalVolumes ?? null,
            chapters: chapters.map((chapter, index) => {
                const explicitNumber = Number(chapter.number) || extractChapterNumber(chapter.name);
                const positionalFallback = isNewestFirst ? chapters.length - index : index + 1;
                return {
                    url: chapter.url,
                    name: chapter.name,
                    number: explicitNumber || positionalFallback
                };
            })
        };
    }

    async parseChapterImages(sourceId, chapterUrl) {
        logger.info(`[Scraper] Requesting chapter images for ${chapterUrl}`);
        const result = await scraperManager.getChapterImages(sourceId, chapterUrl);
        if (!result.success) {
            throw new Error(result.error || 'تعذر جلب صور الفصل.');
        }
        return result.images;
    }
}

const scraperEngineInstance = new ScraperEngine();
export default scraperEngineInstance;
