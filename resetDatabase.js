import 'dotenv/config';
import bcrypt from 'bcrypt';
import { sequelize, User } from './models.js';

async function resetDatabase(force = false) {
    try {
        await sequelize.sync({ force });
        console.log(force ? "資料庫已重建" : "資料庫已初始化");

        // 從 .env 讀取
        const username = process.env.ADMIN_USERNAME || 'admin';
        const password = process.env.ADMIN_PASSWORD || 'password123';

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username,
            password: hashedPassword,
            steamId: process.env.ADMIN_STEAMID || null,
            discordId: process.env.ADMIN_DISCORDID || null,
            isAdmin: process.env.ADMIN_ISADMIN === 'true',
            isApproved: process.env.ADMIN_ISAPPROVED === 'true'
        });

        console.log(`管理員帳號建立成功：${username}`);
    } catch (err) {
        console.error("重建資料庫時發生錯誤：", err);
    } finally {
        await sequelize.close();
    }
}

// 讀 CLI 參數判斷要不要 force
const force = process.argv.includes('--force');
resetDatabase(force);
