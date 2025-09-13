// routes/user.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models.js'); // 注意路徑
const router = express.Router();

// -------------------
// JWT 驗證 middleware
// -------------------
function authAdmin(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: '未登入' });

    const token = header.split(' ')[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (!payload.isAdmin) return res.status(403).json({ error: '權限不足' });
        req.user = payload; // 可在後續需要時使用
        next();
    } catch (err) {
        return res.status(401).json({ error: '無效 token' });
    }
}

// -------------------
// 取得所有使用者
// -------------------
router.get('/users', authAdmin, async (req, res) => {
    try {
        const users = await User.findAll({
            order: [['createdAt', 'ASC']],
            attributes: ['id', 'username', 'isAdmin', 'isApproved', 'steamName', 'discordName']
        });
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '取得帳號列表失敗' });
    }
});

// -------------------
// 核准帳號
// -------------------
router.post('/user/:id/approve', authAdmin, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: '使用者不存在' });

        user.isApproved = true;
        await user.save();
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失敗' });
    }
});

// -------------------
// 升降管理員權限
// -------------------
router.post('/user/:id/admin', authAdmin, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: '使用者不存在' });

        user.isAdmin = req.body.isAdmin;
        await user.save();
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失敗' });
    }
});

// -------------------
// 刪除帳號
// -------------------
router.delete('/user/:id', authAdmin, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: '使用者不存在' });

        await user.destroy();
        res.json({ user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '操作失敗' });
    }
});

module.exports = router;
