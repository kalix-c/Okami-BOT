import scraperEngine from '../modules/scraper.js';
import { QueueSystem } from '../modules/queue.js';
import { UserService } from './user.service.js';
import { MemoryService } from './memory.service.js';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { FacebookPublisher } from '../modules/publisher.js';
import { sendMessage } from './messenger.js';

import db from '../database/db.js';
import { GamificationService } from './gamification.service.js';
import { CommunityService } from './community.service.js';
import { EventService } from './event.service.js';
import { ReadingService } from './reading.service.js';
import { MissionService } from './mission.service.js';
import AutomationService from './automation.service.js';

export class ChatService {
    constructor() {
        this.sessions = new Map(); // fbId -> { step, data }
        this.searchTimeout = 90000; // 90 second timeout for searches (Python engine can be slow)
    }

    async handleMessage(fbId, message) {
        const text = message.trim();
        const lowerText = text.toLowerCase();

        // Global command, works from any state: "الغاء <slug>" cancels an active publish job.
        if (text.startsWith('الغاء ') || text.startsWith('إلغاء ')) {
            const slug = text.split(' ').slice(1).join(' ').trim();
            const cancelled = QueueSystem.cancelJob(slug);
            await sendMessage(fbId, {
                text: cancelled
                    ? `🛑 تم إرسال طلب إلغاء نشر "${slug}". سيتوقف بعد إنهاء الدفعة الحالية.`
                    : `⚠️ لا توجد عملية نشر جارية بهذا المعرف: "${slug}"`
            });
            return;
        }

        let state = this.sessions.get(fbId) || { step: 'START' };

        // Interactive Text-Command System (works globally for all states except when waiting for activation password)
        const cleanCmd = text.replace(/^-+/g, '').replace(/^\/+/g, '').trim();
        const cmdLower = cleanCmd.toLowerCase();
        const isAwaitingPassword = state.step === 'AWAITING_PASSWORD';

        if (!isAwaitingPassword) {
            // Help Command
            if (['help', 'مساعدة', 'تعليمات', 'اوامر', 'أوامر'].includes(cmdLower)) {
                const helpMsg = `🤖 *قائمة الأوامر التفاعلية المتاحة لقراء أوكامي:*

👤 *ملفي* أو *البطاقة*: لعرض تفاصيل حسابك ومستواك ونقاطك.
📅 *يومي* أو *checkin*: لتسجيل الدخول اليومي والحصول على مكافآت.
🏆 *الترتيب* أو *ترتيب*: لعرض قائمة الأوائل والمتصدرين على البوت.
⚔️ *الكلانات* أو *الفرق*: لعرض الكلان والفرق المتنافسة ونقاطها.
🛡️ *انضم [اسم الكلان]*: للانضمام لكلان معين (مثال: \`انضم أوكامي\`).
🎯 *المهام*: لعرض مهامك اليومية النشطة والتقدم المحرز.
📥 *طلب [اسم المانجا]*: لتقديم طلب ترجمة أو نشر عمل جديد على الصفحة.
🗳️ *تصويت [معرف الطلب]*: للتصويت على طلب معلق ومساندته.
📋 *الطلبات*: لعرض قائمة طلبات المانجا الحالية من الأعضاء.
💡 *توصية*: اقتراح أعمال جديدة ممتازة ومشهورة لقراءتها.
📖 *مستمر*: عرض الفصول التي كنت تقرأها مؤخراً لمواصلة الاستمتاع.

🔄 للعودة للقائمة الرئيسية للبوت في أي وقت، أرسل: **مرحبا**`;
                await sendMessage(fbId, { text: helpMsg });
                return;
            }

            // Profile Command
            if (['ملفي', 'البطاقة', 'الملف', 'profile', 'stats', 'id'].includes(cmdLower)) {
                const profile = await UserService.getProfile(fbId);
                const xpNeeded = profile.level * 100;
                const percent = Math.min(100, Math.floor((profile.xp / xpNeeded) * 100));
                
                // Draw a beautiful progress bar
                const barSize = 10;
                const filledSize = Math.floor((percent / 100) * barSize);
                const bar = '▓'.repeat(filledSize) + '░'.repeat(barSize - filledSize);

                const profileMsg = `👤 *ملفك الشخصي لدى أوكامي:*

🏆 اللقب: *${profile.rank_title}*
⭐ المستوى: *${profile.level}*
📊 الـ XP: *${profile.xp}/${xpNeeded}*
📈 التقدم: [${bar}] ${percent}%
🔥 الـ Streak: *${profile.streak || 0}* أيام متواصلة
💰 النقاط: *${profile.points}* نقطة ذهبية

🛡️ القبيلة الحالية: *${profile.guild_name || 'لا يوجد'}*
📅 تاريخ الانضمام: *${profile.created_at ? profile.created_at.split('T')[0] : 'اليوم'}*

_(تفاعل أكثر واقرأ الفصول لرفع مستواك وربح الجوائز! 🐺)_`;
                await sendMessage(fbId, { text: profileMsg });
                return;
            }

            // Daily Checkin Command
            if (['يومي', 'checkin', 'تسجيل'].includes(cmdLower)) {
                const res = await GamificationService.dailyCheckIn(fbId);
                if (res.success) {
                    const checkinMsg = `📅 *تم تسجيل حضورك اليومي بنجاح!* 🎉

🔥 الـ Streak الحالي: *${res.streak}* أيام متتالية!
💰 الجائزة المضافة: *+${res.bonus}* نقطة ذهبية و *+20 XP*!

💡 واصل الدخول يومياً لزيادة الـ Streak ومضاعفة مكافآتك!`;
                    await sendMessage(fbId, { text: checkinMsg });
                } else {
                    await sendMessage(fbId, { text: `⚠️ *لقد قمت بتسجيل الدخول اليومي بالفعل اليوم!*\nعد غداً للحفاظ على سلسلتك النشطة ومضاعفة مكافآتك.` });
                }
                return;
            }

            // Leaderboard Command
            if (['الترتيب', 'ترتيب', 'leaderboard', 'rank', 'top'].includes(cmdLower)) {
                const topUsers = db.prepare('SELECT fb_id, name, points, level, rank_title FROM users ORDER BY points DESC LIMIT 5').all();
                if (!topUsers.length) {
                    await sendMessage(fbId, { text: "📭 لا يوجد متصدرون مسجلون حالياً. كن أول المتصدرين!" });
                } else {
                    let msg = `🏆 *قائمة المتصدرين في أوكامي (Top 5):* 🐺\n\n`;
                    const medals = ['🥇', '🥈', '🥉', '✨', '⚡'];
                    topUsers.forEach((user, i) => {
                        const medal = medals[i] || '🎖️';
                        msg += `${medal} *${user.name || 'مقاتل أوكامي'}* — مستوى ${user.level}\n💰 النقاط: *${user.points}* | اللقب: *${user.rank_title}*\n\n`;
                    });
                    await sendMessage(fbId, { text: msg });
                }
                return;
            }

            // Guilds Command
            if (['الكلانات', 'الفرق', 'guilds', 'clans'].includes(cmdLower)) {
                const guilds = EventService.getGuildLeaderboard();
                let msg = `⚔️ *القبائل والكلانات المتنافسة في أوكامي:* 🛡️\n\n`;
                guilds.forEach((g, i) => {
                    msg += `${i + 1}️⃣ *كلان ${g.name}* \n💰 النقاط الإجمالية: *${g.total_points}* \n👥 عدد المحاربين: *${g.member_count}* أعضاء\n\n`;
                });
                msg += `💡 للانضمام لكلان معين والمساهمة بنقاطك، أرسل: *انضم [اسم الكلان]*`;
                await sendMessage(fbId, { text: msg });
                return;
            }

            // Join Guild Command
            if (cleanCmd.startsWith('انضم ') || cleanCmd.startsWith('الانضمام ')) {
                const guildName = cleanCmd.split(' ').slice(1).join(' ').trim();
                if (!guildName) {
                    await sendMessage(fbId, { text: "⚠️ يرجى تحديد اسم الكلان بشكل صحيح. مثال: \`انضم أوكامي\`" });
                    return;
                }
                try {
                    await EventService.joinGuild(fbId, guildName);
                    await sendMessage(fbId, { text: `🛡️ *أهلاً بك في الكلان!* تم الانضمام لكلان *"${guildName}"* بنجاح!\nالآن، أي نقاط تربحها ستضاف تلقائياً لرصيد كلانك للمنافسة الكبرى! 🔥` });
                } catch (e) {
                    await sendMessage(fbId, { text: `❌ *الكلان "${guildName}" غير موجود!* أرسل "الكلانات" لعرض الكلانات المتاحة حالياً.` });
                }
                return;
            }

            // Missions Command
            if (['المهام', 'missions', 'daily'].includes(cmdLower)) {
                await MissionService.generateDailyMissions(fbId);
                const ongoing = db.prepare(`
                    SELECT um.*, m.title, m.description, m.reward_points 
                    FROM user_missions um
                    JOIN missions m ON um.mission_id = m.id
                    WHERE um.user_fb_id = ?
                `).all(fbId);

                let msg = `🎯 *مهامك اليومية النشطة اليوم:* 🐺\n\n`;
                ongoing.forEach((m, i) => {
                    const statusIcon = m.status === 'completed' ? '✅ [مكتملة]' : '⏳ [قيد التقدم]';
                    msg += `${i + 1}️⃣ *${m.title}* — ${statusIcon}\n📝 الوصف: ${m.description}\n💰 المكافأة: *+${m.reward_points}* نقطة ذهبية و *+50 XP*!\n\n`;
                });
                msg += `💡 يتم تحديث مهامك تلقائياً عند قيامك بالنشاطات (قراءة، تصويت، تعليق)!`;
                await sendMessage(fbId, { text: msg });
                return;
            }

            // Request Command
            if (cleanCmd.startsWith('طلب ') || cleanCmd.startsWith('أطلب ')) {
                const mangaTitle = cleanCmd.split(' ').slice(1).join(' ').trim();
                if (!mangaTitle) {
                    await sendMessage(fbId, { text: "⚠️ يرجى إدخال اسم المانجا المراد طلبها بشكل صحيح. مثال: \`طلب Solo Leveling\`" });
                    return;
                }
                const reqId = await CommunityService.createRequest(fbId, mangaTitle);
                await MissionService.updateMissionProgress(fbId, 'vote'); // Trigger vote/request mission progress
                
                const requestMsg = `📥 *تم تسجيل طلبك بنجاح!* 

📖 اسم العمل: *"${mangaTitle}"*
📌 رقم الطلب للتصويت: *#${reqId}*
💰 المكافأة المكتسبة: *+10 XP* و *+5 نقاط*!

📢 أخبر أصدقاءك بالطلب واطلب منهم إرسال: \`تصويت ${reqId}\` لجمع التصويتات وترجمة ونشر العمل فوراً!`;
                await sendMessage(fbId, { text: requestMsg });
                return;
            }

            // Vote Command
            if (cleanCmd.startsWith('تصويت ') || cleanCmd.startsWith('صوت ')) {
                const reqIdStr = cleanCmd.split(' ').slice(1).join(' ').trim();
                const reqId = parseInt(reqIdStr, 10);
                if (isNaN(reqId)) {
                    await sendMessage(fbId, { text: "⚠️ يرجى كتابة رقم الطلب للتصويت بشكل صحيح. مثال: \`تصويت 3\`" });
                    return;
                }
                const res = await CommunityService.voteForRequest(fbId, reqId);
                if (res.success) {
                    await MissionService.updateMissionProgress(fbId, 'vote');
                    await sendMessage(fbId, { text: `🗳️ *شكراً لتصويتك!* تم تسجيل تصويتك للطلب بنجاح.\n📊 عدد التصويتات الحالي للعمل: *${res.currentVotes}* أصوات.\n💰 المكافأة: *+5 XP* و *+2 نقاط*!` });
                } else {
                    await sendMessage(fbId, { text: `⚠️ *لقد قمت بالتصويت لهذا الطلب مسبقاً!* يمكنك التصويت لطلبات أخرى لمساندة الأعضاء.` });
                }
                return;
            }

            // Requests List Command
            if (['الطلبات', 'requests', 'votes_list'].includes(cmdLower)) {
                const list = CommunityService.getTopRequests();
                if (!list.length) {
                    await sendMessage(fbId, { text: "📋 قائمة الطلبات فارغة حالياً. أرسل: *طلب [اسم المانجا]* لتكون أول من يطلب!" });
                } else {
                    let msg = `📋 *قائمة طلبات المانجا الأكثر تصويتاً:* 🗳️\n\n`;
                    list.forEach((r, i) => {
                        msg += `${i + 1}️⃣ *${r.manga_title}* (طلب #${r.id})\n📊 عدد التصويتات: *${r.votes}* أصوات\n👉 للتصويت له أرسل: \`تصويت ${r.id}\`\n\n`;
                    });
                    await sendMessage(fbId, { text: msg });
                }
                return;
            }

            // Recommendation Command
            if (['توصية', 'توصيات', 'recommend', 'suggestion'].includes(cmdLower)) {
                const recs = await ReadingService.getSmartRecommendations(fbId);
                let msg = `💡 *ترشيحات وتوصيات أوكامي الحصرية لقراءتها اليوم:* 📖\n\n`;
                if (!recs.length) {
                    // Seeding standard recommendations if none parsed yet
                    const staticRecs = [
                        { title: 'Solo Leveling', desc: 'بوابة الصيادين وظهور الوحوش، ومغامرة البطل الأضعف ليصبح الأقوى إطلاقاً.' },
                        { title: 'One Piece', desc: 'أعظم قصة قراصنة ومغامرة شيقة حول البحث عن الكنز الأسطوري والحرية المطلقة.' }
                    ];
                    staticRecs.forEach((r, i) => {
                        msg += `${i + 1}️⃣ *${r.title}* \n📝 نبذة: ${r.desc}\n\n`;
                    });
                } else {
                    recs.forEach((r, i) => {
                        msg += `${i + 1}️⃣ *${r.title}* \n📝 نبذة: ${r.description ? r.description.substring(0, 150) + '...' : 'عمل أسطوري يستحق المتابعة.'}\n\n`;
                    });
                }
                msg += `🐺 استمتع بالقراءة ورافقنا في المغامرة!`;
                await sendMessage(fbId, { text: msg });
                return;
            }

            // Continue Reading Command
            if (['مستمر', 'متابعة', 'continue'].includes(cmdLower)) {
                const history = await ReadingService.getContinueReading(fbId);
                if (!history.length) {
                    await sendMessage(fbId, { text: "📖 لا يوجد سجل قراءة لك حالياً. أرسل 'مرحبا' ثم اختر وضع القارئ وابدأ جولتك الممتعة!" });
                } else {
                    let msg = `📖 *متابعة القراءة - واصل مغامرتك من حيث توقفت:* 🐺\n\n`;
                    history.forEach((h, i) => {
                        msg += `${i + 1}️⃣ *${h.title}* \n📌 آخر فصل قرأته: *الفصل ${h.last_chapter}*\n⏰ في: ${h.updated_at ? h.updated_at.split('T')[0] : 'مؤخراً'}\n\n`;
                    });
                    await sendMessage(fbId, { text: msg });
                }
                return;
            }
        }

        // Check for greeting or reset to restart the session
        if (['مرحبا', 'أهلا', 'start', 'reset', 'خروج', 'أهلا بك'].includes(lowerText)) {
            this.sessions.set(fbId, { step: 'CHOOSING_ROLE' });
            const welcome = "🐺 مرحباً بك في Okami Bot!\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ وضع المطور (Developer Mode)\n2️⃣ وضع القارئ (Reader Mode)\n\nأرسل رقم اختيارك:";
            await sendMessage(fbId, { text: welcome });
            return;
        }

        state = this.sessions.get(fbId) || { step: 'START' };

        try {
            switch (state.step) {
                case 'START':
                    this.sessions.set(fbId, { step: 'CHOOSING_ROLE' });
                    await sendMessage(fbId, { text: "🐺 مرحباً بك في Okami Bot!\nكيف يمكنني مساعدتك اليوم؟\n\n1️⃣ وضع المطور (Developer Mode)\n2️⃣ وضع القارئ (Reader Mode)\n\nأرسل رقم اختيارك:" });
                    break;

                case 'CHOOSING_ROLE':
                    if (text === '1') {
                        this.sessions.set(fbId, { step: 'AWAITING_PASSWORD' });
                        await sendMessage(fbId, { text: "🔐 يرجى إدخال مفتاح التنشيط الخاص بالمطور:" });
                    } else if (text === '2') {
                        const profile = await UserService.getProfile(fbId);
                        this.sessions.set(fbId, { step: 'START' });
                        const profileMsg = `📖 أهلاً بك أيها القارئ!\n👤 ملفك الشخصي:\n⭐ المستوى: ${profile.level}\n🔥 الـ Streak: ${profile.streak}\n🏆 اللقب: ${profile.rank_title}\n💰 النقاط: ${profile.points}\n\nيمكنك متابعة القراءة لزيادة نقاطك! 🐺\n(أرسل "مرحبا" للعودة للقائمة الرئيسية)`;
                        await sendMessage(fbId, { text: profileMsg });
                    } else {
                        await sendMessage(fbId, { text: "❌ اختيار غير صحيح. يرجى اختيار 1 أو 2:" });
                    }
                    break;

                case 'AWAITING_PASSWORD':
                    if (text === config.admin.activationKey) {
                        this.sessions.set(fbId, { step: 'DEV_MENU' });
                        const devMenu = "✅ تم التحقق بنجاح! مرحباً بك أيها المطور.\n\n1️⃣ البحث في جميع المواقع 🔍\n2️⃣ اختيار موقع معين 🌐\n3️⃣ عرض لائحة ما تم نشره 📚\n4️⃣ التحقق من حالة النشر 📊\n5️⃣ تحديث الفهرس الشامل للمانهوات على فيسبوك 🗂️\n6️⃣ إدارة المتابعة التلقائية للفصول الجديدة (التحديث الأسبوعي) 🔄\n\nأرسل رقم الخيار:\n\n(لإلغاء عملية نشر جارية في أي وقت أرسل: إلغاء اسم-العمل)";
                        await sendMessage(fbId, { text: devMenu });
                    } else {
                        await sendMessage(fbId, { text: "❌ مفتاح التنشيط خاطئ. حاول مرة أخرى:" });
                    }
                    break;

                case 'DEV_MENU':
                    if (text === '1') {
                        this.sessions.set(fbId, { step: 'AWAITING_SEARCH_QUERY' });
                        await sendMessage(fbId, { text: "🔍 أرسل اسم المانهوا/المانجا التي تبحث عنها:" });
                    } else if (text === '2') {
                        this.sessions.set(fbId, { step: 'SELECTING_SOURCE' });
                        let menu = "🌐 اختر الموقع:\n";
                        config.sources.forEach((s, i) => menu += `${i + 1}. ${s.name}\n`);
                        await sendMessage(fbId, { text: menu + "\nأرسل رقم الموقع:" });
                    } else if (text === '3') {
                        try {
                            const list = await MemoryService.getAllPublishedManga();
                            if (!list.length) {
                                await sendMessage(fbId, { text: "📭 لا توجد أي أعمال منشورة بعد." });
                            } else {
                                let msg = "📚 الأعمال المنشورة:\n\n";
                                list.forEach((m, i) => {
                                    msg += `${i + 1}. ${m.title} — ${m.publishedCount} فصل منشور (${m.sourceSite})\n`;
                                });
                                await sendMessage(fbId, { text: msg });
                            }
                        } catch (e) {
                            logger.error(`List published error: ${e.message}`);
                            await sendMessage(fbId, { text: "❌ تعذر جلب لائحة المنشورات." });
                        }
                    } else if (text === '4') {
                        try {
                            const isValid = await FacebookPublisher.validateToken();
                            const statusMsg = isValid ? "✅ نظام النشر يعمل بشكل صحيح والتوكن صالح." : "❌ هناك مشكلة في توكن الفيسبوك. يرجى مراجعة الـ Logs.";
                            await sendMessage(fbId, { text: statusMsg });
                        } catch (e) {
                            logger.error(`Token validation error: ${e.message}`);
                            await sendMessage(fbId, { text: "❌ خطأ في التحقق من التوكن. تحقق من الـ Logs." });
                        }
                    } else if (text === '5') {
                        try {
                            await sendMessage(fbId, { text: "⏳ جاري توليد ونشر الفهرس الشامل للمانهوات على فيسبوك..." });
                            await QueueSystem.updateMasterCompilationPost(fbId);
                        } catch (e) {
                            logger.error(`Manual master compilation error: ${e.message}`);
                            await sendMessage(fbId, { text: `❌ فشل تحديث الفهرس الشامل: ${e.message}` });
                        }
                    } else if (text === '6') {
                        this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                        const autoMenu = "🔄 【 المتابعة التلقائية للفصول الجديدة 】 🔄\n\n" +
                            "1️⃣ عرض قائمة الأعمال المتابعة حالياً 📋\n" +
                            "2️⃣ إضافة عمل جديد للمتابعة ➕\n" +
                            "3️⃣ فحص التحديثات ونشرها الآن 🔍\n" +
                            "4️⃣ الرجوع للقائمة الرئيسية 🔙\n\n" +
                            "أرسل رقم الخيار:";
                        await sendMessage(fbId, { text: autoMenu });
                    } else {
                        await sendMessage(fbId, { text: "❌ اختيار غير صحيح." });
                    }
                    break;

                case 'SELECTING_SOURCE':
                    const sourceIdx = parseInt(text) - 1;
                    if (sourceIdx >= 0 && sourceIdx < config.sources.length) {
                        const selectedSource = config.sources[sourceIdx];
                        this.sessions.set(fbId, { step: 'AWAITING_SEARCH_QUERY', sourceId: selectedSource.id });
                        await sendMessage(fbId, { text: `🔍 لقد اخترت ${selectedSource.name}.\nأرسل الآن اسم العمل للبحث فيه:` });
                    } else {
                        await sendMessage(fbId, { text: "❌ رقم موقع غير صحيح." });
                    }
                    break;

                case 'AWAITING_SEARCH_QUERY':
                    const query = text;
                    const sourceId = state.sourceId;
                    
                    if (!query || query.trim().length === 0) {
                        await sendMessage(fbId, { text: "❌ يرجى إدخال اسم صحيح للبحث." });
                        break;
                    }

                    await sendMessage(fbId, { text: `⏳ جاري البحث عن "${query}"...\n⏳ قد يستغرق هذا بعض الوقت...` });
                    
                    try {
                        let results = [];
                        
                        // Add timeout for search operation
                        const searchPromise = sourceId 
                            ? scraperEngine.search(sourceId, query)
                            : scraperEngine.searchAll(query);
                        
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Search timeout')), this.searchTimeout)
                        );
                        
                        results = await Promise.race([searchPromise, timeoutPromise]);

                        if (!results || results.length === 0) {
                            await sendMessage(fbId, { text: "❌ لم يتم العثور على نتائج. حاول كتابة الاسم بشكل مختلف أو أرسل 'مرحبا' للبدء من جديد." });
                            this.sessions.set(fbId, { step: state.isAutomation ? 'AUTOMATION_MENU' : 'DEV_MENU' });
                            return;
                        }

                        this.sessions.set(fbId, { step: 'SELECTING_RESULT', results, isAutomation: state.isAutomation });
                        let resultMsg = `🔎 وجدت ${results.length} نتيجة:\n\n`;
                        results.slice(0, 10).forEach((res, i) => {
                            resultMsg += `${i + 1}️⃣ ${res.title} (${res.sourceName || 'الموقع المختار'})\n`;
                        });
                        await sendMessage(fbId, { text: resultMsg + "\n📌 أرسل الرقم للاختيار:" });
                    } catch (error) {
                        logger.error(`Search error: ${error.message}`);
                        if (error.message === 'Search timeout') {
                            await sendMessage(fbId, { text: "⏱️ انتهت مهلة البحث. يرجى المحاولة مرة أخرى أو اختيار موقع محدد." });
                        } else {
                            await sendMessage(fbId, { text: `❌ حدث خطأ في البحث: ${error.message}\nيرجى المحاولة مرة أخرى.` });
                        }
                        this.sessions.set(fbId, { step: state.isAutomation ? 'AUTOMATION_MENU' : 'DEV_MENU' });
                    }
                    break;

                case 'SELECTING_RESULT':
                    const idx = parseInt(text) - 1;
                    const searchResults = state.results;
                    if (idx >= 0 && idx < searchResults.length) {
                        const selected = searchResults[idx];
                        await sendMessage(fbId, { text: `⏳ جاري جلب معلومات وفصول "${selected.title}"...` });
                        try {
                            const details = await scraperEngine.getMangaDetails(selected.sourceId, selected.url);
                            const mangaSlug = selected.title.toLowerCase()
                                .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
                                .replace(/^-+|-+$/g, '') || `manga-${Date.now()}`;

                            if (details.metadataOnly || details.chapters.length === 0) {
                                const chapterCount = details.totalChapters
                                    ? `\n🔢 عدد الفصول المسجّل: ${details.totalChapters}`
                                    : '';
                                await sendMessage(fbId, {
                                    text: `📖 ${details.title}\n🌐 المصدر: ${selected.sourceName || selected.sourceId}\n📝 ${details.description ? details.description.substring(0, 350) : 'لا يوجد وصف متاح.'}${chapterCount}\n\nℹ️ هذه بيانات وصفية حقيقية من مصدر موثّق، لكنها لا تتضمن صور الفصول أو روابط نشر مرخّصة؛ لذلك لم يبدأ أي نشر تلقائي.`
                                });
                                this.sessions.set(fbId, { step: state.isAutomation ? 'AUTOMATION_MENU' : 'DEV_MENU' });
                                break;
                            }

                            this.sessions.set(fbId, {
                                step: 'CONFIRM_PUBLISH',
                                details,
                                sourceId: selected.sourceId,
                                mangaSlug,
                                mangaUrl: selected.url,
                                isAutomation: state.isAutomation
                            });

                            let infoMsg = `📖 ${details.title}\n` +
                                `🌐 الموقع: ${selected.sourceName || selected.sourceId}\n` +
                                `🔢 عدد الفصول: ${details.chapters.length}\n` +
                                `📝 نبذة: ${details.description ? details.description.substring(0, 200) + '...' : 'لا يوجد وصف متاح.'}\n\n`;
                            
                            if (state.isAutomation) {
                                infoMsg += `1️⃣ لتأكيد إضافة هذا العمل للمتابعة التلقائية (نشر الفصول الجديدة تلقائياً) 🔄\n` +
                                    `2️⃣ للإلغاء والعودة لقائمة المتابعة 🔙`;
                            } else {
                                infoMsg += `1️⃣ لتأكيد بدء النشر التلقائي (كل الفصول، دفعتين دفعتين)\n` +
                                    `2️⃣ للإلغاء واختيار مانجا أخرى\n` +
                                    `3️⃣ لاختيار فصل واحد فقط للنشر يدوياً`;
                            }
                            await sendMessage(fbId, { text: infoMsg });
                        } catch (e) {
                            logger.error(`Details fetch error: ${e.message}`);
                            await sendMessage(fbId, { text: "❌ حدث خطأ في جلب تفاصيل العمل. تأكد من أن الموقع يعمل." });
                            this.sessions.set(fbId, { step: state.isAutomation ? 'AUTOMATION_MENU' : 'DEV_MENU' });
                        }
                    } else {
                        await sendMessage(fbId, { text: "❌ رقم غير صحيح." });
                    }
                    break;

                case 'CONFIRM_PUBLISH': {
                    const details = state.details;
                    if (state.isAutomation) {
                        if (text === '1') {
                            try {
                                const maxCh = details.chapters.reduce((max, ch) => Math.max(max, ch.number), 0);
                                await AutomationService.addMangaToTrack(details.title, state.mangaUrl, state.sourceId, maxCh);
                                await sendMessage(fbId, { text: `✅ تم بنجاح إضافة "${details.title}" للمتابعة التلقائية!\nسيقوم البوت بفحص فصوله تلقائياً ونشر الفصول الجديدة بمجرد صدورها.` });
                                
                                // Show automation menu again
                                this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                                const autoMenu = "🔄 【 المتابعة التلقائية للفصول الجديدة 】 🔄\n\n" +
                                    "1️⃣ عرض قائمة الأعمال المتابعة حالياً 📋\n" +
                                    "2️⃣ إضافة عمل جديد للمتابعة ➕\n" +
                                    "3️⃣ فحص التحديثات ونشرها الآن 🔍\n" +
                                    "4️⃣ الرجوع للقائمة الرئيسية 🔙\n\n" +
                                    "أرسل رقم الخيار:";
                                await sendMessage(fbId, { text: autoMenu });
                            } catch (e) {
                                logger.error(`Add track error: ${e.message}`);
                                await sendMessage(fbId, { text: `❌ فشل إضافة العمل للمتابعة: ${e.message}` });
                                this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                            }
                        } else if (text === '2') {
                            this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                            const autoMenu = "🔄 【 المتابعة التلقائية للفصول الجديدة 】 🔄\n\n" +
                                "1️⃣ عرض قائمة الأعمال المتابعة حالياً 📋\n" +
                                "2️⃣ إضافة عمل جديد للمتابعة ➕\n" +
                                "3️⃣ فحص التحديثات ونشرها الآن 🔍\n" +
                                "4️⃣ الرجوع للقائمة الرئيسية 🔙\n\n" +
                                "أرسل رقم الخيار:";
                            await sendMessage(fbId, { text: autoMenu });
                        } else {
                            await sendMessage(fbId, { text: "❌ اختيار غير صحيح. أرسل 1 للتأكيد أو 2 للإلغاء والعودة:" });
                        }
                        break;
                    }
                    if (text === '1') {
                        try {
                            const savedManga = await MemoryService.saveManga({
                                title: details.title,
                                slug: state.mangaSlug,
                                coverUrl: details.coverUrl,
                                description: details.description,
                                status: details.status,
                                sourceSite: state.sourceId,
                                sourceUrl: state.mangaUrl
                            });
                            const mangaId = savedManga._id;

                            await sendMessage(fbId, { text: `👍 تم التأكيد. بدأ النشر التلقائي لـ "${details.title}" في الخلفية...\n(يمكنك إلغاؤه لاحقاً بإرسال: إلغاء ${state.mangaSlug})` });
                            this.sessions.set(fbId, { step: 'DEV_MENU' });

                            const baseMessage = `╭━━━〔 🔥 فصل جديد 🔥 〕━━━╮\n📖 اسم العمل: ❪ ${details.title} ❫\n📌 الفصل: ❪ {chapter} ❫\n╰━━━━━━━━━━━━━━━╯\n\n🔥 لا تنسوا المتابعة ليصلكم كل جديد\n💬 شاركونا رأيكم 👇`;

                            // Fire-and-forget: runs in the background, progress comes via sendMessage.
                            QueueSystem.startMangaPublishing({
                                mangaId,
                                mangaTitle: details.title,
                                mangaSlug: state.mangaSlug,
                                chapters: details.chapters,
                                sourceId: state.sourceId,
                                adminFbId: fbId,
                                baseMessage
                            });
                        } catch (e) {
                            logger.error(`Confirm publish error: ${e.message}`);
                            await sendMessage(fbId, { text: `❌ تعذر بدء النشر: ${e.message}` });
                            this.sessions.set(fbId, { step: 'DEV_MENU' });
                        }
                    } else if (text === '2') {
                        this.sessions.set(fbId, { step: 'AWAITING_SEARCH_QUERY', sourceId: state.sourceId });
                        await sendMessage(fbId, { text: "🔄 تم الإلغاء. أرسل اسم مانجا أخرى للبحث عنها:" });
                    } else if (text === '3') {
                        this.sessions.set(fbId, { step: 'SELECTING_CHAPTER', details, sourceId: state.sourceId, mangaSlug: state.mangaSlug });
                        let chapterMsg = `📖 ${details.title}\n✅ تم العثور على ${details.chapters.length} فصل.\n\nأحدث الفصول:\n`;
                        details.chapters.slice(0, 10).forEach((ch, i) => {
                            chapterMsg += `${i + 1}. ${ch.name}\n`;
                        });
                        await sendMessage(fbId, { text: chapterMsg + "\nأرسل رقم الفصل للنشر:" });
                    } else {
                        await sendMessage(fbId, { text: "❌ من فضلك أرسل 1 للتأكيد، 2 للإلغاء، أو 3 للنشر اليدوي لفصل واحد." });
                    }
                    break;
                }

                case 'SELECTING_CHAPTER':
                    const chIdx = parseInt(text) - 1;
                    const mangaDetails = state.details;
                    if (chIdx >= 0 && chIdx < mangaDetails.chapters.length) {
                        const chapter = mangaDetails.chapters[chIdx];
                        
                        const postMessage = `╭━━━〔 🔥 فصل جديد 🔥 〕━━━╮\n📖 اسم العمل: ❪ ${mangaDetails.title} ❫\n📌 الفصل: ❪ ${chapter.name} ❫\n╰━━━━━━━━━━━━━━━╯\n\n📝 نبذة:\n${mangaDetails.description ? mangaDetails.description.substring(0, 200) + '...' : 'لا يوجد وصف متاح.'}\n\n━━━━━━━━━━━━━━━\n🔥 لا تنسوا المتابعة ليصلكم كل جديد\n💬 شاركونا رأيكم 👇`;

                        await sendMessage(fbId, { text: `🚀 جاري العمل على جلب وتحميل وتقسيم صور "${chapter.name}" من "${mangaDetails.title}"...\nسيتم إرسال تنبيه لك فور الانتهاء من النشر على فيسبوك. 🐺🔥` });

                        QueueSystem.addChapterToQueue({
                            mangaTitle: mangaDetails.title,
                            chapterName: chapter.name,
                            chapterNumber: Number(chapter.number) || (chIdx + 1),
                            chapterUrl: chapter.url,
                            sourceKey: state.sourceId,
                            adminFbId: fbId,
                            customMessage: postMessage
                        });

                        this.sessions.set(fbId, { step: 'DEV_MENU' });
                    } else {
                        await sendMessage(fbId, { text: "❌ رقم فصل غير صحيح." });
                    }
                    break;

                case 'AUTOMATION_MENU':
                    if (text === '1') {
                        const tracked = AutomationService.getTrackedMangaList();
                        if (!tracked || tracked.length === 0) {
                            await sendMessage(fbId, { text: "📭 لا توجد أعمال متابعة تلقائياً حالياً." });
                        } else {
                            let listMsg = "📋 الأعمال المتابعة حالياً:\n\n";
                            tracked.forEach((m) => {
                                listMsg += `• [ID: ${m.id}] ${m.title}\n  الموقع: ${m.source_id} | آخر فصل: ${m.last_chapter}\n\n`;
                            });
                            listMsg += "💡 لإزالة عمل من المتابعة، أرسل: إزالة رقم-المعرف (مثال: إزالة 1)\n\nأرسل 4 للرجوع.";
                            await sendMessage(fbId, { text: listMsg });
                            this.sessions.set(fbId, { step: 'AUTOMATION_MANAGE' });
                        }
                    } else if (text === '2') {
                        this.sessions.set(fbId, { step: 'AWAITING_SEARCH_QUERY', isAutomation: true });
                        await sendMessage(fbId, { text: "🔍 أرسل اسم العمل للبحث عنه وإضافته للمتابعة التلقائية:" });
                    } else if (text === '3') {
                        try {
                            await sendMessage(fbId, { text: "⏳ جاري فحص جميع الأعمال المتابعة وتنزيل ونشر أي فصول جديدة..." });
                            await AutomationService.checkUpdates();
                            await sendMessage(fbId, { text: "✅ اكتمل فحص التحديثات ونشر الفصول الجديدة بنجاح!" });
                        } catch (err) {
                            await sendMessage(fbId, { text: `❌ فشل فحص التحديثات: ${err.message}` });
                        }
                    } else if (text === '4') {
                        this.sessions.set(fbId, { step: 'DEV_MENU' });
                        const devMenu = "✅ تم العودة للقائمة الرئيسية.\n\n1️⃣ البحث في جميع المواقع 🔍\n2️⃣ اختيار موقع معين 🌐\n3️⃣ عرض لائحة ما تم نشره 📚\n4️⃣ التحقق من حالة النشر 📊\n5️⃣ تحديث الفهرس الشامل للمانهوات على فيسبوك 🗂️\n6️⃣ إدارة المتابعة التلقائية للفصول الجديدة (التحديث الأسبوعي) 🔄\n\nأرسل رقم الخيار:\n\n(لإلغاء عملية نشر جارية في أي وقت أرسل: إلغاء اسم-العمل)";
                        await sendMessage(fbId, { text: devMenu });
                    } else {
                        await sendMessage(fbId, { text: "❌ اختيار غير صحيح. أرسل رقم الخيار (1-4):" });
                    }
                    break;

                case 'AUTOMATION_MANAGE':
                    if (text === '4' || text === 'عودة') {
                        this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                        const autoMenu = "🔄 【 المتابعة التلقائية للفصول الجديدة 】 🔄\n\n" +
                            "1️⃣ عرض قائمة الأعمال المتابعة حالياً 📋\n" +
                            "2️⃣ إضافة عمل جديد للمتابعة ➕\n" +
                            "3️⃣ فحص التحديثات ونشرها الآن 🔍\n" +
                            "4️⃣ الرجوع للقائمة الرئيسية 🔙\n\n" +
                            "أرسل رقم الخيار:";
                        await sendMessage(fbId, { text: autoMenu });
                    } else if (text.startsWith('إزالة')) {
                        const parts = text.split(' ');
                        const id = parseInt(parts[1]);
                        if (!id || isNaN(id)) {
                            await sendMessage(fbId, { text: "❌ صيغة خاطئة. يرجى إرسال: إزالة رقم-المعرف (مثال: إزالة 1) أو أرسل 4 للرجوع." });
                        } else {
                            try {
                                await AutomationService.removeMangaFromTrack(id);
                                await sendMessage(fbId, { text: `✅ تم بنجاح إزالة العمل ذو المعرف [${id}] من قائمة المتابعة التلقائية.` });
                                this.sessions.set(fbId, { step: 'AUTOMATION_MENU' });
                                const autoMenu = "🔄 【 المتابعة التلقائية للفصول الجديدة 】 🔄\n\n" +
                                    "1️⃣ عرض قائمة الأعمال المتابعة حالياً 📋\n" +
                                    "2️⃣ إضافة عمل جديد للمتابعة ➕\n" +
                                    "3️⃣ فحص التحديثات ونشرها الآن 🔍\n" +
                                    "4️⃣ الرجوع للقائمة الرئيسية 🔙\n\n" +
                                    "أرسل رقم الخيار:";
                                await sendMessage(fbId, { text: autoMenu });
                            } catch (err) {
                                await sendMessage(fbId, { text: `❌ فشل إزالة العمل: ${err.message}` });
                            }
                        }
                    } else {
                        await sendMessage(fbId, { text: "❌ أمر غير مفهوم. أرسل: إزالة رقم-المعرف أو أرسل 4 للرجوع." });
                    }
                    break;

                default:
                    this.sessions.set(fbId, { step: 'CHOOSING_ROLE' });
                    await sendMessage(fbId, { text: "🐺 مرحباً بك! أرسل 'مرحبا' للبدء." });
            }
        } catch (error) {
            logger.error(`[ChatService] Error handling message: ${error.message}`);
            await sendMessage(fbId, { text: "⚠️ حدث خطأ داخلي. يرجى المحاولة مرة أخرى بإرسال 'مرحبا'." });
            this.sessions.set(fbId, { step: 'START' });
        }
    }
}

export default new ChatService();
