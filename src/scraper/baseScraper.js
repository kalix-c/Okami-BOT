import * as cheerio from 'cheerio';
import axios from 'axios';
import logger from '../utils/logger.js';

export class BaseScraper {
    constructor(sourceName, baseUrl) {
        this.sourceName = sourceName;
        this.baseUrl = baseUrl;
    }

    async fetch(url) {
        try {
            logger.info(`[${this.sourceName}] Fetching source URL: ${url}`);
            const response = await axios.get(url, {
                timeout: 12000,
                headers: {
                    'User-Agent': 'Okami-BOT/2.0 (+https://github.com/kalix-c/Okami-BOT)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
                }
            });
            return cheerio.load(response.data);
        } catch (error) {
            const status = error.response?.status ? ` (HTTP ${error.response.status})` : '';
            throw new Error(`[${this.sourceName}] تعذر الوصول إلى المصدر${status}: ${error.message}`);
        }
    }

    async fetchPage(url, selector, options = {}) {
        return this.fetch(url, { waitSelector: selector, ...options });
    }

    async fetchWithBrowser() {
        throw new Error(`[${this.sourceName}] لا يوجد بديل متصفح في هذا المشروع. لن تُعاد بيانات مصطنعة عند فشل المصدر.`);
    }

    async close() {
        // لا توجد موارد دائمة في استخراج HTTP العادي.
    }

    findResilient($, selectors) {
        for (const selector of selectors) {
            const element = $(selector);
            if (element?.length > 0) return element;
        }
        return null;
    }

    mockDataDisabled(operation) {
        throw new Error(`[${this.sourceName}] تعذر ${operation}: البيانات التجريبية معطلة، ولم يعد البوت يعرض محتوى غير حقيقي.`);
    }

    generateMockSearchResults() {
        return this.mockDataDisabled('البحث في المصدر');
    }

    generateMockMangaInfo() {
        return this.mockDataDisabled('جلب تفاصيل العمل');
    }

    generateMockChapters() {
        return this.mockDataDisabled('جلب الفصول');
    }

    generateMockChapterImages() {
        return this.mockDataDisabled('جلب صور الفصل');
    }
}
