import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { sendMessage } from '../services/messenger.js';

function getPublisherConfig() {
    const accessToken = config.facebook.accessToken;
    const pageId = config.facebook.pageId;
    const apiVersion = config.facebook.graphApiVersion || 'v26.0';

    if (!accessToken || !pageId) {
        throw new Error('إعداد النشر غير مكتمل: أضف FB_PAGE_ACCESS_TOKEN وFB_PAGE_ID. لا تُستخدم كوكيز الحسابات الشخصية.');
    }

    return {
        accessToken,
        pageId,
        baseUrl: `https://graph.facebook.com/${apiVersion}/${pageId}`
    };
}

function describeGraphError(error) {
    if (error.response?.data?.error) {
        const graphError = error.response.data.error;
        return `${graphError.message || 'خطأ من Graph API'}${graphError.code ? ` (code ${graphError.code})` : ''}`;
    }
    return error.message;
}

export class FacebookPublisher {
    static async validateToken() {
        try {
            const { accessToken } = getPublisherConfig();
            const response = await axios.get('https://graph.facebook.com/me', {
                params: { access_token: accessToken },
                timeout: 15000
            });
            logger.info(`[Publisher] Page token validated for: ${response.data.name || response.data.id}`);
            return { valid: true, account: response.data };
        } catch (error) {
            const message = describeGraphError(error);
            logger.error(`[Publisher] Token validation failed: ${message}`);
            return { valid: false, error: message };
        }
    }

    static async sendDirectMessage(psid, messagePayload) {
        try {
            const result = await sendMessage(psid, messagePayload);
            logger.info(`[Publisher] Direct message sent to ${psid}`);
            return result;
        } catch (error) {
            logger.error(`[Publisher] Direct message error: ${error.message}`);
            throw error;
        }
    }

    static async publishChapter(imagePaths, message) {
        if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
            throw new Error('لا يمكن النشر من دون صور فصل تم التحقق منها.');
        }

        const publisher = getPublisherConfig();
        logger.info(`[Publisher] Starting verified chapter publish with ${imagePaths.length} image(s).`);
        const photoIds = [];

        for (const [index, imagePath] of imagePaths.entries()) {
            const photoId = await this.uploadPhoto(imagePath, publisher);
            photoIds.push({ media_fbid: photoId });
            logger.info(`[Publisher] Uploaded verified image ${index + 1}/${imagePaths.length}: ${photoId}`);
        }

        try {
            const response = await axios.post(`${publisher.baseUrl}/feed`, {
                message,
                attached_media: photoIds,
                published: true,
                access_token: publisher.accessToken
            }, { timeout: 30000 });
            logger.info(`[Publisher] Chapter published successfully: ${response.data.id}`);
            return response.data.id;
        } catch (error) {
            const detail = describeGraphError(error);
            logger.error(`[Publisher] Chapter publishing error: ${detail}`);
            throw new Error(`فشل النشر عبر Pages API: ${detail}`);
        }
    }

    static async uploadPhoto(filePath, publisher = getPublisherConfig()) {
        const form = new FormData();
        try {
            if (String(filePath).startsWith('http://') || String(filePath).startsWith('https://')) {
                const source = await axios.get(filePath, { responseType: 'stream', timeout: 30000 });
                form.append('source', source.data);
            } else {
                if (!fs.existsSync(filePath)) {
                    throw new Error(`ملف الصورة غير موجود: ${filePath}`);
                }
                form.append('source', fs.createReadStream(filePath));
            }

            form.append('published', 'false');
            form.append('access_token', publisher.accessToken);
            const response = await axios.post(`${publisher.baseUrl}/photos`, form, {
                headers: form.getHeaders(),
                timeout: 60000
            });
            return response.data.id;
        } catch (error) {
            throw new Error(`فشل رفع الصورة: ${describeGraphError(error)}`);
        }
    }

    static async publishCustomPost(message, imageUrl = null) {
        const publisher = getPublisherConfig();
        if (!String(message || '').trim()) {
            throw new Error('نص المنشور مطلوب.');
        }

        try {
            const endpoint = imageUrl ? `${publisher.baseUrl}/photos` : `${publisher.baseUrl}/feed`;
            const payload = { message, access_token: publisher.accessToken };
            if (imageUrl) payload.url = imageUrl;

            const response = await axios.post(endpoint, payload, { timeout: 30000 });
            const postId = response.data.post_id || response.data.id;
            logger.info(`[Publisher] Custom Page post published: ${postId}`);
            return postId;
        } catch (error) {
            const detail = describeGraphError(error);
            logger.error(`[Publisher] Custom post error: ${detail}`);
            throw new Error(`فشل نشر المنشور عبر Pages API: ${detail}`);
        }
    }
}

export default FacebookPublisher;
