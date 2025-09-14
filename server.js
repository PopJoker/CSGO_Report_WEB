require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const fs = require('fs');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const DiscordStrategy = require('passport-discord').Strategy;
const { sequelize, User, Report } = require('./models');
const { Server } = require("socket.io");
const cron = require('node-cron');

const app = express();
const http = require('http').createServer(app);
const io = new Server(http, {
    cors: { origin: '*' }
});
const session = require('express-session');

app.use(session({
    secret: 'your_secret_here',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Socket.IO 連線事件
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Cloudinary 設定
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer 上傳
const upload = multer({ dest: 'uploads/' });

// ---------------- JWT 驗證與管理員 ----------------
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found' });
        req.user = user;

        console.log('JWT decoded user:', decoded);
        console.log('req.user:', req.user);

        next();
    } catch (err) {
        console.error('JWT 驗證失敗:', err.message);
        return res.status(401).json({ error: 'Invalid token', details: err.message });
    }
};


const adminMiddleware = async (req, res, next) => {
    try {
        if (!req.user || !req.user.isAdmin) {
            console.log('Checking admin failed:', req.user?.username, req.user?.isAdmin);
            return res.status(403).json({ error: 'Not admin' });
        }
        console.log('Checking admin:', req.user?.username, req.user?.isAdmin);
        next();
    } catch (err) {
        console.error('Admin middleware error:', err);
        return res.status(500).json({ error: 'Admin check failed', details: err.message });
    }
};


// 初始化 Passport
app.use(passport.initialize());

// ------------------- OAuth 設定 -------------------
// Steam OAuth (只綁定，不自動創建帳號)
passport.use(new SteamStrategy({
    returnURL: process.env.STEAM_RETURN_URL,
    realm: process.env.STEAM_REALM,
    apiKey: process.env.STEAM_API_KEY
}, async (identifier, profile, done) => {
    return done(null, {
        steamId: profile.id,
        steamName: profile.displayName
    });
}));

// Discord OAuth (只綁定，不自動創建帳號)
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    return done(null, {
        discordId: profile.id,
        discordName: profile.username
    });
}));

// ------------------- Routes -------------------

// 註冊
app.post('/register', async (req, res) => {
    const { username, password, steamId, discordId } = req.body;
    if (!username || !password) return res.status(400).json({ error: '請填寫完整資料' });

    try {
        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({
            username,
            password: hash,
            steamId: steamId || null,
            discordId: discordId || null,
            isAdmin: false,
            isApproved: false
        });
        res.json({ message: 'Registered, waiting for approval', user });
    } catch (err) {
        res.status(400).json({ error: 'Username exists' });
    }
});

// 密碼登入
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '請填寫完整資料' });

    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(400).json({ error: '帳號不存在' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: '密碼錯誤' });

    if (!user.isApproved) return res.status(403).json({ error: '帳號尚未核准，無法登入' });

    if (user.steamId && !user.steamName) {
        try {
            const steamResp = await axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${user.steamId}`);
            if (steamResp.data.response.players.length) {
                user.steamName = steamResp.data.response.players[0].personaname;
                await user.save();
            }
        } catch (err) {
            console.error('取得 Steam 名稱失敗', err.message);
        }
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, isAdmin: user.isAdmin },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    res.json({
        token,
        isAdmin: user.isAdmin,
        steamName: user.steamName,
        discordName: user.discordName
    });
});

// ------------------- /users 管理員列表 -------------------
app.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'isAdmin', 'isApproved', 'steamId', 'discordId', 'steamName', 'discordName', 'createdAt']
        });
        // 轉成純物件
        const plainUsers = users.map(u => u.get({ plain: true }));
        res.json(plainUsers);
    } catch (err) {
        console.error('取得帳號列表失敗:', err.message);
        res.status(500).json({ error: '取得帳號列表失敗', details: err.message });
    }
});

// ------------------- 管理操作 -------------------

// 核准帳號
app.post('/users/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        console.log('Approve userId:', userId);

        if (isNaN(userId)) return res.status(400).json({ error: 'ID 格式錯誤' });

        const user = await User.findByPk(userId);
        console.log('Found user:', user?.username);

        if (!user) return res.status(404).json({ error: '使用者不存在' });
        if (user.isApproved) return res.status(400).json({ error: '使用者已核准' });

        user.isApproved = true;
        await user.save();

        console.log('User approved:', user.username);
        res.json({ message: '使用者已核准', user });
    } catch (err) {
        console.error('核准失敗:', err);
        res.status(500).json({ error: '核准操作失敗', details: err.message });
    }
});

// 升級為管理員
app.post('/users/:id/promote', authMiddleware, adminMiddleware, async (req, res) => {
    const { isAdmin } = req.body;
    const userId = Number(req.params.id);
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: '使用者不存在' });

    user.isAdmin = !!isAdmin; // true 升權，false 降權
    await user.save();

    res.json({ message: `帳號 ${user.username} 已${isAdmin ? '升權' : '降權'}`, user });
});


// 刪除帳號
app.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (isNaN(userId)) return res.status(400).json({ error: 'ID 格式錯誤' });

        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: '使用者不存在' });

        const username = user.username; // 先記住名字
        await user.destroy();

        console.log('User deleted:', username);
        res.json({ message: '使用者已刪除', user: { id: userId, username } });
    } catch (err) {
        console.error('刪除失敗:', err);
        res.status(500).json({ error: '刪除操作失敗', details: err.message });
    }
});


// ------------------- Steam / Discord 綁定 -------------------
// 打開 OAuth 前，先存 token 到 session
app.get('/auth/steam', (req, res, next) => {
    const token = req.query.token;
    if (!token) return res.status(400).send('JWT token is required');
    req.session.bindToken = token;  // <-- 存到 session
    passport.authenticate('steam', { session: false })(req, res, next);
});

// Steam callback
app.get('/auth/steam/return',
    passport.authenticate('steam', { failureRedirect: '/login', session: false }),
    async (req, res) => {
        try {
            const token = req.session.bindToken; // 從 session 取
            if (!token) throw new Error('JWT missing');

            // 驗證 JWT
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findByPk(decoded.id);
            if (!user) throw new Error('User not found');

            // 綁定 Steam
            user.steamId = req.user.steamId;
            user.steamName = req.user.steamName;
            await user.save();

            // 回傳給前端 popup
            res.send(`<script>
                window.opener.postMessage({ 
                    bind: 'success', 
                    type:'Steam', 
                    steamId:'${user.steamId}',
                    steamName:'${user.steamName}' 
                }, '*');
                window.close();
            </script>`);

            req.session.bindToken = null; // 清掉
        } catch (err) {
            console.error('Steam bind failed:', err);
            res.send(`<script>
                window.opener.postMessage({ bind: 'fail', type:'Steam', error:'${err.message}' }, '*');
                window.close();
            </script>`);
        }
    }
);






// Discord OAuth 前置
app.get('/auth/discord', (req, res, next) => {
    const token = req.query.token;
    if (!token) return res.status(400).send('缺少 token');
    req.session.bindToken = token;  // <-- 用 session 存 token
    passport.authenticate('discord', { session: false })(req, res, next);
});

// Discord callback
app.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/', session: false }),
    async (req, res) => {
        try {
            const bindToken = req.session.bindToken;
            if (!bindToken) throw new Error('JWT missing');
            const decoded = jwt.verify(bindToken, process.env.JWT_SECRET);
            const user = await User.findByPk(decoded.id);
            if (!user) throw new Error('User not found');

            // 綁定 Discord
            user.discordId = req.user.discordId;
            user.discordName = req.user.discordName;
            await user.save();

            // 發新的 JWT
            const newToken = jwt.sign(
                { id: user.id, username: user.username, isAdmin: user.isAdmin },
                process.env.JWT_SECRET,
                { expiresIn: '1d' }
            );

            req.session.bindToken = null; // 清掉 session

            res.redirect(`/oauth-callback.html?bind=success&type=discord&discordName=${encodeURIComponent(user.discordName)}&token=${newToken}`);
        } catch (err) {
            console.error('Discord 綁定失敗：', err);
            res.redirect(`/oauth-callback.html?bind=fail&type=discord&error=${encodeURIComponent(err.message)}`);
        }
    }
);


// ------------------- 檢舉系統 -------------------
app.post('/report', authMiddleware, upload.single('evidence'), async (req, res) => {
    const user = req.user;
    if (!user.isApproved) return res.status(403).json({ error: '帳號尚未核准，無法提交檢舉' });

    const socketId = req.body.socketId;
    const socket = io.sockets.sockets.get(socketId);

    try {
        const { steamId, matchId, type, description } = req.body;
        if (!steamId || !type) return res.status(400).json({ error: 'Missing steamId or type' });

        res.status(202).json({ message: '檢舉正在處理' });

        let evidenceUrl = '';

        if (req.file) {
            if (!fs.existsSync(req.file.path)) {
                socket?.emit('reportError', { error: '上傳檔案不存在' });
                return;
            }

            socket?.emit('uploadProgress', { progress: 10, message: '開始上傳檔案到 Cloudinary' });

            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    resource_type: 'auto',
                    use_filename: true,
                    unique_filename: false
                });

                evidenceUrl = result.secure_url;
                fs.unlinkSync(req.file.path);
                socket?.emit('uploadProgress', { progress: 100, message: '檔案上傳完成', url: evidenceUrl });
            } catch (err) {
                socket?.emit('reportError', { error: '檔案上傳失敗', details: err.message || JSON.stringify(err) });
                return;
            }
        }

        const report = await Report.create({
            steamId,
            matchId: matchId || '',
            type,
            description: description || '',
            evidenceUrl,
            reporterId: user.id,
            approved: false,
            createdAt: new Date()
        });

        // 再 fetch 一次，包含 reporter 資訊
        const fullReport = await Report.findByPk(report.id, {
            include: [{ model: User, as: 'reporter', attributes: ['username', 'steamName'] }]
        });

        socket?.emit('reportDone', { message: '檢舉完成，已送審', url: evidenceUrl });

        // 發送到 Discord，狀態 pending
        await sendDiscordReport(fullReport, 'pending');

    } catch (err) {
        console.error('Report failed:', err);
        socket?.emit('reportError', { error: '伺服器錯誤：' + err.message });
    }
});




const { Op, fn, col, where } = require('sequelize');

app.get('/reports', authMiddleware, async (req, res) => {
    const { query } = req.query;
    let whereClause;

    try {
        if (!query) {
            // 沒提供 query → 自動回傳自己提交的檢舉
            whereClause = { reporterId: req.user.id };
        } else {
            const q = query.toLowerCase(); // 統一轉小寫比對
            whereClause = {
                [Op.or]: [
                    sequelize.where(fn('lower', col('Report.steamId')), { [Op.like]: `%${q}%` }),
                    sequelize.where(fn('lower', col('Report.steamName')), { [Op.like]: `%${q}%` }),
                    sequelize.where(fn('lower', col('reporter.steamId')), { [Op.like]: `%${q}%` }),
                    sequelize.where(fn('lower', col('reporter.steamName')), { [Op.like]: `%${q}%` }),
                    sequelize.where(fn('lower', col('reporter.discordId')), { [Op.like]: `%${q}%` })
                ]
            };
        }

        const reports = await Report.findAll({
            include: [{
                model: User,
                as: 'reporter',
                attributes: ['id', 'username', 'steamId', 'steamName', 'discordId'], // <-- 加 discordId
                required: false
            }],
            where: whereClause,
            order: [['createdAt', 'DESC']]
        });

        const formatted = reports.map(r => ({
            id: r.id,
            steamId: r.steamId,
            steamName: r.steamName,
            matchId: r.matchId,
            type: r.type,
            description: r.description,
            approved: r.approved,
            createdAt: r.createdAt,
            evidenceUrl: r.evidenceUrl || null,
            reporter: r.reporter ? {
                id: r.reporter.id,
                username: r.reporter.username,
                steamId: r.reporter.steamId,
                steamName: r.reporter.steamName,
                discordId: r.reporter.discordId,
                hasDiscord: !!r.reporter.discordId // <-- 判斷是否綁定 Discord
            } : null
        }));

        res.json(formatted);

    } catch (err) {
        console.error('取得檢舉紀錄失敗:', err);
        res.status(500).json({ error: '取得檢舉紀錄失敗', details: err.message });
    }
});


// ------------------- 管理員檢舉管理 -------------------

// 管理員檢舉列表
app.get('/admin/reports', authMiddleware, adminMiddleware, async (req, res) => {
    const status = req.query.status; // pending / approved
    const whereClause = {};

    if (status === 'pending') whereClause.approved = false;
    else if (status === 'approved') whereClause.approved = true;

    try {
        const reports = await Report.findAll({
            where: whereClause,
            include: [{
                model: User,
                as: 'reporter',
                attributes: ['id', 'username', 'steamId', 'steamName', 'discordId'], // 加 discordId
                required: false
            }],
            order: [['createdAt', 'DESC']]
        });

        // 轉成前端可直接使用格式
        const formatted = reports.map(r => ({
            id: r.id,
            steamId: r.steamId,
            matchId: r.matchId,
            type: r.type,
            description: r.description,
            approved: r.approved,
            createdAt: r.createdAt,
            evidenceUrl: r.evidenceUrl || null,
            reporter: r.reporter ? {
                id: r.reporter.id,
                username: r.reporter.username,
                steamId: r.reporter.steamId,
                steamName: r.reporter.steamName,
                discordId: r.reporter.discordId,
                hasDiscord: !!r.reporter.discordId // 判斷是否綁定 Discord
            } : null
        }));

        res.json(formatted);
    } catch (err) {
        console.error('取得檢舉列表失敗:', err);
        res.status(500).json({ error: '取得檢舉列表失敗', details: err.message });
    }
});


// ------------------- Server Start -------------------
const startServer = async () => {
    try {
        await sequelize.sync();

        // 初始化管理員（只在 INIT_ADMIN=true 時建立）
        if (process.env.INIT_ADMIN === 'true' && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
            const existingAdmin = await User.findOne({ where: { username: process.env.ADMIN_USERNAME } });
            if (!existingAdmin) {
                const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
                await User.create({
                    username: process.env.ADMIN_USERNAME,
                    password: hash,
                    isAdmin: true,
                    isApproved: true,
                    steamId: process.env.ADMIN_STEAMID || null,
                    discordId: process.env.ADMIN_DISCORDID || null
                });
                console.log('Admin account created');
            } else {
                console.log('Admin already exists, skipping creation');
            }
        } else {
            console.log('INIT_ADMIN not set to true, skipping admin creation');
        }

        const PORT = process.env.PORT || 5000;
        http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
        console.error('Failed to start server:', err);
    }
};
// 更新 Steam 名稱
const updateSteamName = async (user) => {
    try {
        const resp = await axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${user.steamId}`);
        const player = resp.data.response.players[0];
        if (player && player.personaname !== user.steamName) {
            user.steamName = player.personaname;
            await user.save();
            console.log(`Updated Steam name for ${user.username}: ${user.steamName}`);
        }
    } catch (err) {
        console.error(`Steam update failed for ${user.username}:`, err.message);
    }
};

// 更新 Discord 名稱
const updateDiscordName = async (user) => {
    try {
        const resp = await axios.get(`https://discord.com/api/users/${user.discordId}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
        });
        if (resp.data.username !== user.discordName) {
            user.discordName = resp.data.username;
            await user.save();
            console.log(`Updated Discord name for ${user.username}: ${user.discordName}`);
        }
    } catch (err) {
        console.error(`Discord update failed for ${user.username}:`, err.message);
    }
};

const syncAllNames = async () => {
    console.log('=== 開始自動同步 Steam / Discord 名稱 ===');
    const steamUsers = await User.findAll({ where: { steamId: { [sequelize.Op.ne]: null } } });
    for (const user of steamUsers) await updateSteamName(user);

    const discordUsers = await User.findAll({ where: { discordId: { [sequelize.Op.ne]: null } } });
    for (const user of discordUsers) await updateDiscordName(user);
    console.log('=== 自動同步完成 ===');
};

cron.schedule('0 0 * * *', syncAllNames);

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// 初始化 Discord Bot
const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
discordClient.login(process.env.DISCORD_BOT_TOKEN);

discordClient.on('ready', () => {
    console.log(`Discord Bot logged in as ${discordClient.user.tag}`);
});
//核准檢舉
app.post('/admin/reports/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const report = await Report.findByPk(req.params.id, {
            include: [{ model: User, as: 'reporter', attributes: ['username', 'steamId', 'steamName'] }]
        });
        if (!report) return res.status(404).json({ error: '檢舉不存在' });
        if (report.approved) return res.status(400).json({ error: '檢舉已核准' });

        report.approved = true;
        await report.save();

        // ✅ 用 sendDiscordReport 統一通知
        await sendDiscordReport(report, 'approved');

        res.json({ message: '檢舉已核准', report: { id: report.id, steamId: report.steamId } });
    } catch (err) {
        console.error('核准檢舉失敗:', err);
        res.status(500).json({ error: '核准失敗', details: err.message });
    }
});


// 拒絕 / 刪除檢舉
app.delete('/admin/reports/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const report = await Report.findByPk(req.params.id, {
            include: [{ model: User, as: 'reporter', attributes: ['username', 'steamId', 'steamName'] }]
        });
        if (!report) return res.status(404).json({ error: '檢舉不存在' });

        const reportId = report.id;
        await report.destroy();

        // ❌ 用 sendDiscordReport 統一通知
        await sendDiscordReport(report, 'rejected');

        res.json({ message: '檢舉已拒絕', report: { id: reportId, steamId: report.steamId } });
    } catch (err) {
        console.error('刪除檢舉失敗:', err);
        res.status(500).json({ error: '刪除失敗', details: err.message });
    }
});


/**
 * 發送檢舉狀態通知到 Discord
 * @param {Report} report
 * @param {'pending'|'approved'|'rejected'} status
 */
const sendDiscordReport = async (report, status = 'approved') => {
    try {
        const channel = await discordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID);

        let title, color;
        switch (status) {
            case 'pending':
                title = '檢舉待審 ⚠️';
                color = 'Yellow';
                break;
            case 'approved':
                title = '檢舉已核准 ✅';
                color = 'Green';
                break;
            case 'rejected':
                title = '檢舉已拒絕 ❌';
                color = 'Red';
                break;
            default:
                title = '檢舉狀態';
                color = 'Grey';
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .addFields(
                { name: '檢舉 ID', value: report.id.toString(), inline: true },
                { name: '被檢舉玩家 SteamID', value: report.steamId || '無', inline: true },
                { name: '檢舉類型', value: report.type || '無', inline: true },
                { name: '描述', value: report.description || '無' },
                { name: '檢舉人', value: `${report.reporter?.username || '未知'} (${report.reporter?.steamName || '無'})` },
                { name: '證據', value: report.evidenceUrl || '無' }
            )
            .setColor(color)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Discord notification failed:', err);
    }
};




startServer();
