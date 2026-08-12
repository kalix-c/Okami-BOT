import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const dbPath = path.resolve('./src/database/okami_db.json');

// Helper to guarantee directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

class JSONDatabase {
    constructor() {
        this.data = {
            users: [],
            manga: [],
            chapters: [],
            publish_queue: [],
            tracked_manga: [],
            requests: [],
            votes: [],
            events: [],
            guilds: [],
            followers: [],
            notifications: [],
            user_missions: [],
            missions: [],
            reading_history: [],
            user_streaks: []
        };
        this.load();
    }

    load() {
        if (fs.existsSync(dbPath)) {
            try {
                const raw = fs.readFileSync(dbPath, 'utf8');
                this.data = JSON.parse(raw);
                logger.info('[JSONDatabase] Database loaded successfully from ' + dbPath);
            } catch (e) {
                logger.error('[JSONDatabase] Error parsing database file: ' + e.message + '. Resetting to empty.');
            }
        } else {
            logger.info('[JSONDatabase] No existing database file found. Initializing with seeds.');
            this.seed();
            this.save();
        }
    }

    save() {
        try {
            fs.writeFileSync(dbPath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            logger.error('[JSONDatabase] Error saving database file: ' + e.message);
        }
    }

    seed() {
        // Seed standard missions
        this.data.missions = [
            { id: 1, title: 'قراءة فصل', description: 'اقرأ أي فصل مانجا للحصول على مكافأة', reward_points: 20, type: 'read', required_progress: 1 },
            { id: 2, title: 'التصويت لعمل', description: 'صوّت لعمل تود ترجمته في قائمة الطلبات', reward_points: 15, type: 'vote', required_progress: 1 },
            { id: 3, title: 'مشاركة تعليق', description: 'تفاعل بوضع تعليق مميز على أحد الفصول', reward_points: 25, type: 'comment', required_progress: 1 }
        ];

        // Seed standard guilds
        this.data.guilds = [
            { id: 1, name: 'أوكامي', total_points: 1500, member_count: 5 },
            { id: 2, name: 'الفائزون', total_points: 900, member_count: 3 },
            { id: 3, name: 'الأبطال', total_points: 600, member_count: 2 }
        ];

        // لا يُنشأ أي عمل متابع تلقائيًا؛ تُضاف الأعمال فقط من مصدر موثّق وباختيار المسؤول.
        this.data.tracked_manga = [];

        logger.info('[JSONDatabase] Standard guilds and missions seeded; tracked manga starts empty.');
    }

    exec(sql) {
        logger.info('[JSONDatabase] SQLite exec script: schema checked/mocked');
        return this;
    }

    prepare(sql) {
        const dbInstance = this;
        const normalizedSql = sql.replace(/\s+/g, ' ').trim();

        return {
            get: (...args) => {
                logger.info(`[JSONDatabase] get: ${normalizedSql} with args ${JSON.stringify(args)}`);

                // 1. SELECT * FROM users WHERE fb_id = ?
                if (normalizedSql.includes('FROM users WHERE fb_id = ?')) {
                    const fbId = args[0];
                    const user = dbInstance.data.users.find(u => u.fb_id === fbId);
                    return user || null;
                }

                // 2. SELECT * FROM user_streaks WHERE user_fb_id = ?
                if (normalizedSql.includes('FROM user_streaks WHERE user_fb_id = ?')) {
                    const fbId = args[0];
                    const streak = dbInstance.data.user_streaks.find(s => s.user_fb_id === fbId);
                    return streak || null;
                }

                // 3. SELECT last_login, streak FROM users WHERE fb_id = ?
                if (normalizedSql.includes('last_login, streak FROM users WHERE fb_id = ?')) {
                    const fbId = args[0];
                    const user = dbInstance.data.users.find(u => u.fb_id === fbId);
                    return user ? { last_login: user.last_login, streak: user.streak } : null;
                }

                // 4. SELECT id FROM guilds WHERE name = ?
                if (normalizedSql.includes('FROM guilds WHERE name = ?')) {
                    const name = args[0];
                    const guild = dbInstance.data.guilds.find(g => g.name === name);
                    return guild || null;
                }

                // 5. SELECT title FROM manga WHERE id = ?
                if (normalizedSql.includes('title FROM manga WHERE id = ?')) {
                    const mangaId = args[0];
                    const m = dbInstance.data.manga.find(item => item.id === mangaId);
                    return m ? { title: m.title } : null;
                }

                // 6. SELECT votes, manga_title FROM requests WHERE id = ?
                if (normalizedSql.includes('votes, manga_title FROM requests WHERE id = ?')) {
                    const reqId = args[0];
                    const req = dbInstance.data.requests.find(r => r.id === reqId);
                    return req ? { votes: req.votes, manga_title: req.manga_title } : null;
                }

                // 7. SELECT id FROM chapters WHERE manga_id = ? AND chapter_number = ?
                if (normalizedSql.includes('FROM chapters WHERE manga_id = ? AND chapter_number = ?')) {
                    const mangaId = args[0];
                    const chNum = args[1];
                    const chapter = dbInstance.data.chapters.find(c => c.manga_id === mangaId && c.chapter_number === chNum);
                    return chapter ? { id: chapter.id } : null;
                }

                // 8. SELECT * FROM events WHERE is_active = 1 AND end_date > CURRENT_TIMESTAMP
                if (normalizedSql.includes('FROM events WHERE is_active = 1')) {
                    const activeEvent = dbInstance.data.events.find(e => e.is_active === 1 && new Date(e.end_date) > new Date());
                    return activeEvent || null;
                }

                // 9. SELECT COUNT(*) as count FROM chapters WHERE published_at >= date("now")
                if (normalizedSql.includes('COUNT(*) as count FROM chapters')) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const count = dbInstance.data.chapters.filter(c => c.published_at && c.published_at.startsWith(todayStr)).length;
                    return { count };
                }

                // 10. SELECT COUNT(*) as count FROM reading_history WHERE updated_at >= date("now")
                if (normalizedSql.includes('COUNT(*) as count FROM reading_history')) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const count = dbInstance.data.reading_history.filter(rh => rh.updated_at && rh.updated_at.startsWith(todayStr)).length;
                    return { count };
                }

                // 11. SELECT COUNT(*) as count FROM users WHERE created_at >= date("now")
                if (normalizedSql.includes('COUNT(*) as count FROM users')) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const count = dbInstance.data.users.filter(u => u.created_at && u.created_at.startsWith(todayStr)).length;
                    return { count };
                }

                return null;
            },

            all: (...args) => {
                logger.info(`[JSONDatabase] all: ${normalizedSql} with args ${JSON.stringify(args)}`);

                // 1. SELECT * FROM users
                if (normalizedSql.includes('FROM users ORDER BY points DESC')) {
                    const limitIdx = normalizedSql.indexOf('LIMIT');
                    const limit = limitIdx !== -1 ? parseInt(normalizedSql.substring(limitIdx + 5).trim(), 10) : 5;
                    const sorted = [...dbInstance.data.users].sort((a, b) => (b.points || 0) - (a.points || 0));
                    return sorted.slice(0, limit);
                }

                if (normalizedSql.includes('SELECT fb_id FROM users')) {
                    return dbInstance.data.users.map(u => ({ fb_id: u.fb_id }));
                }

                // 2. SELECT * FROM tracked_manga WHERE auto_post = 1
                if (normalizedSql.includes('FROM tracked_manga WHERE auto_post = 1')) {
                    return dbInstance.data.tracked_manga.filter(m => m.auto_post === 1);
                }

                // 3. SELECT * FROM requests WHERE status = "pending" ORDER BY votes DESC LIMIT 10
                if (normalizedSql.includes('FROM requests WHERE status = "pending"')) {
                    const pending = dbInstance.data.requests.filter(r => r.status === 'pending');
                    const sorted = pending.sort((a, b) => (b.votes || 0) - (a.votes || 0));
                    return sorted.slice(0, 10);
                }

                // 4. SELECT name, total_points, member_count FROM guilds ORDER BY total_points DESC
                if (normalizedSql.includes('FROM guilds ORDER BY total_points DESC')) {
                    return [...dbInstance.data.guilds].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
                }

                // 5. SELECT user_fb_id FROM followers WHERE manga_id = ?
                if (normalizedSql.includes('FROM followers WHERE manga_id = ?')) {
                    const mangaId = args[0];
                    return dbInstance.data.followers.filter(f => f.manga_id === mangaId).map(f => ({ user_fb_id: f.user_fb_id }));
                }

                // 6. SELECT * FROM notifications WHERE is_sent = 0 LIMIT 10
                if (normalizedSql.includes('FROM notifications WHERE is_sent = 0')) {
                    const pending = dbInstance.data.notifications.filter(n => n.is_sent === 0);
                    return pending.slice(0, 10);
                }

                // 7. SELECT * FROM user_missions WHERE user_fb_id = ? AND status = "ongoing"
                if (normalizedSql.includes('FROM user_missions WHERE user_fb_id = ? AND status = "ongoing"')) {
                    const fbId = args[0];
                    return dbInstance.data.user_missions.filter(um => um.user_fb_id === fbId && um.status === 'ongoing');
                }

                // 8. SELECT * FROM missions ORDER BY RANDOM() LIMIT 3
                if (normalizedSql.includes('FROM missions ORDER BY RANDOM()')) {
                    const limitIdx = normalizedSql.indexOf('LIMIT');
                    const limit = limitIdx !== -1 ? parseInt(normalizedSql.substring(limitIdx + 5).trim(), 10) : 3;
                    const shuffled = [...dbInstance.data.missions].sort(() => 0.5 - Math.random());
                    return shuffled.slice(0, limit);
                }

                // 9. JOIN missions logic inside mission.service.js
                if (normalizedSql.includes('JOIN missions m ON um.mission_id = m.id')) {
                    const fbId = args[0];
                    const type = args[1];
                    const ongoing = dbInstance.data.user_missions.filter(um => um.user_fb_id === fbId && um.status === 'ongoing');
                    const results = [];
                    for (const um of ongoing) {
                        const m = dbInstance.data.missions.find(item => item.id === um.mission_id);
                        if (m && m.type === type) {
                            results.push({
                                ...um,
                                reward_points: m.reward_points
                            });
                        }
                    }
                    return results;
                }

                // 10. SELECT * FROM manga WHERE status = 'ongoing'
                if (normalizedSql.includes("FROM manga WHERE status = 'ongoing'")) {
                    return dbInstance.data.manga.filter(m => m.status && m.status.toLowerCase() === 'ongoing');
                }

                // 11. SELECT h.*, m.title, m.cover_url FROM reading_history h JOIN manga m
                if (normalizedSql.includes('FROM reading_history h JOIN manga m')) {
                    const fbId = args[0];
                    const history = dbInstance.data.reading_history.filter(h => h.user_fb_id === fbId);
                    const sorted = history.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
                    const limitIdx = normalizedSql.indexOf('LIMIT');
                    const limit = limitIdx !== -1 ? parseInt(normalizedSql.substring(limitIdx + 5).trim(), 10) : 5;
                    const sliced = sorted.slice(0, limit);
                    return sliced.map(h => {
                        const m = dbInstance.data.manga.find(item => item.id === h.manga_id) || {};
                        return {
                            ...h,
                            title: m.title || 'Unknown Manga',
                            cover_url: m.cover_url || ''
                        };
                    });
                }

                // 12. SELECT m.* FROM manga m WHERE m.id NOT IN (SELECT manga_id FROM reading_history WHERE user_fb_id = ?)
                if (normalizedSql.includes('NOT IN (SELECT manga_id FROM reading_history')) {
                    const fbId = args[0];
                    const readMangaIds = dbInstance.data.reading_history.filter(h => h.user_fb_id === fbId).map(h => h.manga_id);
                    const notReadManga = dbInstance.data.manga.filter(m => !readMangaIds.includes(m.id));
                    
                    // Simple score: how many times it was read by anyone
                    const getCount = (mangaId) => dbInstance.data.reading_history.filter(h => h.manga_id === mangaId).length;
                    const sorted = notReadManga.sort((a, b) => getCount(b.id) - getCount(a.id));
                    return sorted.slice(0, 3);
                }

                return [];
            },

            run: (...args) => {
                logger.info(`[JSONDatabase] run: ${normalizedSql} with args ${JSON.stringify(args)}`);

                let lastInsertRowid = Date.now();
                let changes = 1;

                // 1. INSERT INTO users (fb_id, name, level, xp, points, streak) VALUES (?, ?, ?, ?, ?, ?)
                if (normalizedSql.includes('INSERT INTO users')) {
                    const [fb_id, name, level, xp, points, streak] = args;
                    const existingIdx = dbInstance.data.users.findIndex(u => u.fb_id === fb_id);
                    const newUser = {
                        fb_id,
                        name: name || 'User',
                        level: level !== undefined ? level : 1,
                        xp: xp !== undefined ? xp : 0,
                        points: points !== undefined ? points : 0,
                        streak: streak !== undefined ? streak : 0,
                        created_at: new Date().toISOString(),
                        last_login: new Date().toISOString(),
                        rank_title: 'مبتدئ'
                    };
                    if (existingIdx !== -1) {
                        dbInstance.data.users[existingIdx] = { ...dbInstance.data.users[existingIdx], ...newUser };
                    } else {
                        dbInstance.data.users.push(newUser);
                    }
                }

                // 2. UPDATE users SET points = ?, xp = ?, level = ? WHERE fb_id = ?
                else if (normalizedSql.includes('UPDATE users SET points = ?, xp = ?, level = ? WHERE fb_id = ?')) {
                    const [points, xp, level, fb_id] = args;
                    const u = dbInstance.data.users.find(user => user.fb_id === fb_id);
                    if (u) {
                        u.points = points;
                        u.xp = xp;
                        u.level = level;
                    }
                }

                // 3. UPDATE users SET points = points + 100 WHERE fb_id = ?
                else if (normalizedSql.includes('UPDATE users SET points = points + 100 WHERE fb_id = ?')) {
                    const fb_id = args[0];
                    const u = dbInstance.data.users.find(user => user.fb_id === fb_id);
                    if (u) {
                        u.points = (u.points || 0) + 100;
                    }
                }

                // 4. UPDATE users SET guild_id = ? WHERE fb_id = ?
                else if (normalizedSql.includes('UPDATE users SET guild_id = ? WHERE fb_id = ?')) {
                    const [guild_id, fb_id] = args;
                    const u = dbInstance.data.users.find(user => user.fb_id === fb_id);
                    if (u) {
                        u.guild_id = guild_id;
                    }
                }

                // 5. UPDATE users SET streak = ?, last_login = ? WHERE fb_id = ?
                else if (normalizedSql.includes('UPDATE users SET streak = ?, last_login = ? WHERE fb_id = ?')) {
                    const [streak, last_login, fb_id] = args;
                    const u = dbInstance.data.users.find(user => user.fb_id === fb_id);
                    if (u) {
                        u.streak = streak;
                        u.last_login = last_login;
                    }
                }

                // 6. INSERT OR REPLACE INTO users (fb_id, streak, last_login) VALUES (?, 1, ?)
                else if (normalizedSql.includes('INSERT OR REPLACE INTO users (fb_id, streak, last_login)')) {
                    const [fb_id, last_login] = args;
                    const u = dbInstance.data.users.find(user => user.fb_id === fb_id);
                    if (u) {
                        u.streak = 1;
                        u.last_login = last_login;
                    } else {
                        dbInstance.data.users.push({
                            fb_id,
                            streak: 1,
                            last_login,
                            name: 'User',
                            level: 1,
                            xp: 0,
                            points: 0,
                            rank_title: 'مبتدئ'
                        });
                    }
                }

                // 7. INSERT INTO requests (user_fb_id, manga_title) VALUES (?, ?)
                else if (normalizedSql.includes('INSERT INTO requests (user_fb_id, manga_title)')) {
                    const [user_fb_id, manga_title] = args;
                    const id = dbInstance.data.requests.length + 1;
                    dbInstance.data.requests.push({
                        id,
                        user_fb_id,
                        manga_title,
                        votes: 1,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    });
                    lastInsertRowid = id;
                }

                // 8. INSERT INTO votes (user_fb_id, request_id) VALUES (?, ?)
                else if (normalizedSql.includes('INSERT INTO votes (user_fb_id, request_id)')) {
                    const [user_fb_id, request_id] = args;
                    const alreadyVoted = dbInstance.data.votes.some(v => v.user_fb_id === user_fb_id && v.request_id === request_id);
                    if (alreadyVoted) {
                        throw new Error('Already voted');
                    }
                    dbInstance.data.votes.push({
                        id: dbInstance.data.votes.length + 1,
                        user_fb_id,
                        request_id
                    });
                }

                // 9. UPDATE requests SET votes = votes + 1 WHERE id = ?
                else if (normalizedSql.includes('UPDATE requests SET votes = votes + 1 WHERE id = ?')) {
                    const reqId = args[0];
                    const req = dbInstance.data.requests.find(r => r.id === reqId);
                    if (req) {
                        req.votes = (req.votes || 0) + 1;
                    }
                }

                // 10. UPDATE events SET is_active = 0
                else if (normalizedSql.includes('UPDATE events SET is_active = 0')) {
                    dbInstance.data.events.forEach(e => {
                        e.is_active = 0;
                    });
                }

                // 11. INSERT INTO events (name, type, start_date, end_date, is_active)
                else if (normalizedSql.includes('INSERT INTO events')) {
                    const [name, type, end_date] = args;
                    const id = dbInstance.data.events.length + 1;
                    dbInstance.data.events.push({
                        id,
                        name,
                        type,
                        start_date: new Date().toISOString(),
                        end_date,
                        is_active: 1
                    });
                    lastInsertRowid = id;
                }

                // 12. UPDATE guilds SET member_count = member_count + 1 WHERE id = ?
                else if (normalizedSql.includes('UPDATE guilds SET member_count = member_count + 1 WHERE id = ?')) {
                    const guildId = args[0];
                    const g = dbInstance.data.guilds.find(guild => guild.id === guildId);
                    if (g) {
                        g.member_count = (g.member_count || 0) + 1;
                    }
                }

                // 13. UPDATE guilds SET total_points = total_points + ? WHERE id = ?
                else if (normalizedSql.includes('UPDATE guilds SET total_points = total_points + ? WHERE id = ?')) {
                    const [points, guildId] = args;
                    const g = dbInstance.data.guilds.find(guild => guild.id === guildId);
                    if (g) {
                        g.total_points = (g.total_points || 0) + points;
                    }
                }

                // 14. UPDATE tracked_manga SET last_chapter = ? WHERE id = ?
                else if (normalizedSql.includes('UPDATE tracked_manga SET last_chapter = ? WHERE id = ?')) {
                    const [lastChapter, id] = args;
                    const m = dbInstance.data.tracked_manga.find(item => item.id === id);
                    if (m) {
                        m.last_chapter = lastChapter;
                    }
                }

                // 15. INSERT INTO tracked_manga (title, url, source_id, last_chapter) VALUES (?, ?, ?, ?)
                else if (normalizedSql.includes('INSERT INTO tracked_manga')) {
                    const [title, url, source_id, last_chapter] = args;
                    const id = dbInstance.data.tracked_manga.length + 1;
                    dbInstance.data.tracked_manga.push({
                        id,
                        title,
                        url,
                        source_id,
                        last_chapter,
                        auto_post: 1
                    });
                    lastInsertRowid = id;
                }

                // 16. INSERT OR IGNORE INTO followers (user_fb_id, manga_id)
                else if (normalizedSql.includes('INSERT OR IGNORE INTO followers')) {
                    const [fb_id, manga_id] = args;
                    const exists = dbInstance.data.followers.some(f => f.user_fb_id === fb_id && f.manga_id === manga_id);
                    if (!exists) {
                        dbInstance.data.followers.push({
                            id: dbInstance.data.followers.length + 1,
                            user_fb_id: fb_id,
                            manga_id
                        });
                    }
                }

                // 17. DELETE FROM followers WHERE user_fb_id = ? AND manga_id = ?
                else if (normalizedSql.includes('DELETE FROM followers WHERE user_fb_id = ? AND manga_id = ?')) {
                    const [fb_id, manga_id] = args;
                    dbInstance.data.followers = dbInstance.data.followers.filter(f => !(f.user_fb_id === fb_id && f.manga_id === manga_id));
                }

                // 18. INSERT INTO notifications (user_fb_id, message)
                else if (normalizedSql.includes('INSERT INTO notifications (user_fb_id, message)')) {
                    const [fb_id, message] = args;
                    const id = dbInstance.data.notifications.length + 1;
                    dbInstance.data.notifications.push({
                        id,
                        user_fb_id: fb_id,
                        message,
                        is_sent: 0,
                        created_at: new Date().toISOString()
                    });
                    lastInsertRowid = id;
                }

                // 19. UPDATE notifications SET is_sent = 1 WHERE id = ?
                else if (normalizedSql.includes('UPDATE notifications SET is_sent = 1 WHERE id = ?')) {
                    const id = args[0];
                    const n = dbInstance.data.notifications.find(item => item.id === id);
                    if (n) {
                        n.is_sent = 1;
                    }
                }

                // 20. INSERT INTO user_missions (user_fb_id, mission_id) VALUES (?, ?)
                else if (normalizedSql.includes('INSERT INTO user_missions (user_fb_id, mission_id)')) {
                    const [user_fb_id, mission_id] = args;
                    const id = dbInstance.data.user_missions.length + 1;
                    dbInstance.data.user_missions.push({
                        id,
                        user_fb_id,
                        mission_id,
                        progress: 0,
                        status: 'ongoing'
                    });
                    lastInsertRowid = id;
                }

                // 21. UPDATE user_missions SET status = "completed", progress = ? WHERE user_fb_id = ? AND mission_id = ?
                else if (normalizedSql.includes('UPDATE user_missions SET status = "completed"')) {
                    const [progress, user_fb_id, mission_id] = args;
                    const um = dbInstance.data.user_missions.find(item => item.user_fb_id === user_fb_id && item.mission_id === mission_id && item.status === 'ongoing');
                    if (um) {
                        um.progress = progress;
                        um.status = 'completed';
                    }
                }

                // 22. UPDATE user_missions SET progress = ? WHERE user_fb_id = ? AND mission_id = ?
                else if (normalizedSql.includes('UPDATE user_missions SET progress = ? WHERE user_fb_id = ? AND mission_id = ?')) {
                    const [progress, user_fb_id, mission_id] = args;
                    const um = dbInstance.data.user_missions.find(item => item.user_fb_id === user_fb_id && item.mission_id === mission_id && item.status === 'ongoing');
                    if (um) {
                        um.progress = progress;
                    }
                }

                // 23. INSERT INTO reading_history (user_fb_id, manga_id, last_chapter, updated_at) ON CONFLICT
                else if (normalizedSql.includes('INSERT INTO reading_history')) {
                    const [user_fb_id, manga_id, last_chapter] = args;
                    const existingIdx = dbInstance.data.reading_history.findIndex(h => h.user_fb_id === user_fb_id && h.manga_id === manga_id);
                    if (existingIdx !== -1) {
                        dbInstance.data.reading_history[existingIdx].last_chapter = last_chapter;
                        dbInstance.data.reading_history[existingIdx].updated_at = new Date().toISOString();
                    } else {
                        dbInstance.data.reading_history.push({
                            id: dbInstance.data.reading_history.length + 1,
                            user_fb_id,
                            manga_id,
                            last_chapter,
                            updated_at: new Date().toISOString()
                        });
                    }
                }

                // 24. INSERT INTO user_streaks (user_fb_id, current_streak, last_activity_date)
                else if (normalizedSql.includes('INSERT INTO user_streaks')) {
                    const [user_fb_id, today] = args;
                    dbInstance.data.user_streaks.push({
                        id: dbInstance.data.user_streaks.length + 1,
                        user_fb_id,
                        current_streak: 1,
                        last_activity_date: today,
                        highest_streak: 1
                    });
                }

                // 25. UPDATE user_streaks SET current_streak = ?, last_activity_date = ?, highest_streak = MAX...
                else if (normalizedSql.includes('UPDATE user_streaks SET current_streak = ?, last_activity_date = ?')) {
                    const [current_streak, today, highest_streak, user_fb_id] = args;
                    const streak = dbInstance.data.user_streaks.find(s => s.user_fb_id === user_fb_id);
                    if (streak) {
                        streak.current_streak = current_streak;
                        streak.last_activity_date = today;
                        streak.highest_streak = Math.max(streak.highest_streak || 1, highest_streak);
                    }
                }

                // 26. UPDATE user_streaks SET current_streak = 1, last_activity_date = ? WHERE user_fb_id = ?
                else if (normalizedSql.includes('UPDATE user_streaks SET current_streak = 1')) {
                    const [today, user_fb_id] = args;
                    const streak = dbInstance.data.user_streaks.find(s => s.user_fb_id === user_fb_id);
                    if (streak) {
                        streak.current_streak = 1;
                        streak.last_activity_date = today;
                    }
                }

                // Save on any write query
                dbInstance.save();

                return { changes, lastInsertRowid };
            }
        };
    }
}

const db = new JSONDatabase();
export default db;

