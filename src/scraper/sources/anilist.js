import axios from 'axios';
import logger from '../../utils/logger.js';

const API_URL = 'https://graphql.anilist.co';

const SEARCH_QUERY = `
  query SearchManga($search: String!) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
        id
        siteUrl
        title { romaji english native }
        description(asHtml: false)
        coverImage { large medium }
        status
        chapters
        volumes
        format
        countryOfOrigin
        updatedAt
      }
    }
  }
`;

const MEDIA_QUERY = `
  query MangaById($id: Int!) {
    Media(id: $id, type: MANGA) {
      id
      siteUrl
      title { romaji english native }
      description(asHtml: false)
      coverImage { large medium }
      status
      chapters
      volumes
      format
      countryOfOrigin
      updatedAt
    }
  }
`;

function readableTitle(title = {}) {
    return title.english || title.romaji || title.native || 'عنوان غير متاح';
}

function cleanDescription(description) {
    return (description || 'لا يوجد وصف متاح من المصدر.')
        .replace(/\s+/g, ' ')
        .trim();
}

function getMediaId(url) {
    const match = String(url || '').match(/\/manga\/(\d+)/i);
    if (!match) {
        throw new Error('رابط AniList غير صالح: تعذر استخراج معرف العمل.');
    }
    return Number(match[1]);
}

export class AniListScraper {
    constructor() {
        this.sourceName = 'AniList';
        this.sourceKey = 'anilist';
        this.baseUrl = 'https://anilist.co';
    }

    async request(query, variables) {
        try {
            const response = await axios.post(API_URL, { query, variables }, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Okami-BOT/2.0 (+https://github.com/kalix-c/Okami-BOT)'
                }
            });

            if (response.data?.errors?.length) {
                throw new Error(response.data.errors.map((item) => item.message).join('; '));
            }
            return response.data?.data;
        } catch (error) {
            const detail = error.response?.data?.errors
                ? error.response.data.errors.map((item) => item.message).join('; ')
                : error.message;
            throw new Error(`تعذر جلب بيانات AniList الحقيقية: ${detail}`);
        }
    }

    async search(query) {
        const data = await this.request(SEARCH_QUERY, { search: query.trim() });
        const media = data?.Page?.media || [];
        logger.info(`[AniList] Real metadata search returned ${media.length} result(s) for "${query}".`);

        return media.map((item) => ({
            title: readableTitle(item.title),
            url: item.siteUrl || `${this.baseUrl}/manga/${item.id}`,
            thumbnail: item.coverImage?.medium || item.coverImage?.large || '',
            source: this.sourceKey,
            sourceName: this.sourceName,
            metadataOnly: true
        }));
    }

    async getMangaInfo(url) {
        const id = getMediaId(url);
        const data = await this.request(MEDIA_QUERY, { id });
        const item = data?.Media;
        if (!item) {
            throw new Error('لم يعثر AniList على العمل المطلوب.');
        }

        return {
            id: item.id,
            title: readableTitle(item.title),
            cover: item.coverImage?.large || item.coverImage?.medium || '',
            description: cleanDescription(item.description),
            status: item.status || 'UNKNOWN',
            totalChapters: item.chapters ?? null,
            totalVolumes: item.volumes ?? null,
            format: item.format || 'MANGA',
            countryOfOrigin: item.countryOfOrigin || null,
            updatedAt: item.updatedAt || null,
            source: this.sourceKey,
            sourceUrl: item.siteUrl || `${this.baseUrl}/manga/${item.id}`,
            publishingAllowed: false
        };
    }

    async getChapters() {
        // AniList يقدّم العدد الإجمالي عند توفره، ولا يقدّم صور الفصول أو روابطها.
        return [];
    }

    async getChapterImages() {
        throw new Error('مصدر AniList يوفّر بيانات وصفية فقط؛ لا يدعم جلب صور الفصول أو إعادة نشرها.');
    }

    async close() {
        // لا توجد اتصالات مستمرة لإغلاقها.
    }
}
