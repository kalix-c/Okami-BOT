import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const DATA_DIR = process.env.DATA_DIR || './data';

export const config = {
    facebook: {
        // مخصص حصريًا لـ Pages API؛ لا تُقرأ ولا تُخزّن كوكيز المتصفح.
        accessToken: process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || process.env.PAGE_ACCESS_TOKEN || '',
        pageId: process.env.FB_PAGE_ID || '',
        appSecret: process.env.FB_APP_SECRET || '',
        verifyToken: process.env.FB_VERIFY_TOKEN || process.env.VERIFY_TOKEN || 'okami_verify_token',
        graphApiVersion: process.env.FB_GRAPH_API_VERSION || 'v26.0'
    },
    admin: {
        activationKey: process.env.ADMIN_ACTIVATION_KEY || '',
        password: process.env.ADMIN_PASSWORD || ''
    },
    database: {
        path: path.join(DATA_DIR, 'okami.db'),
        mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || ''
    },
    scraping: {
        timeout: Number(process.env.SCRAPER_TIMEOUT_MS || 15000),
        cacheTTL: Number(process.env.SCRAPER_CACHE_TTL_SECONDS || 3600),
        // يمنع هذا المشروع من إظهار نتائج أو صور مولدة على أنها من مصدر حقيقي.
        allowMockData: false
    },
    sources: [
        {
            id: 'anilist',
            name: 'AniList (بيانات موثقة)',
            url: 'https://anilist.co',
            capabilities: ['search', 'metadata'],
            publishingAllowed: false
        }
    ],
    settings: {
        maxImageHeight: 1500,
        cleanupAfterPost: true,
        tempDir: path.join(DATA_DIR, 'temp')
    }
};

export default config;
