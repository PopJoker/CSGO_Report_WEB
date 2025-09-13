// models.js
import { Sequelize, DataTypes } from 'sequelize';
import 'dotenv/config';

export const sequelize = new Sequelize(process.env.DB_URI, {
    logging: false,
    define: {
        freezeTableName: true, // 避免自動加上 "s"
        paranoid: false,       // 我們希望直接刪掉資料，而不是軟刪除
    },
});

// User 模型
export const User = sequelize.define('User', {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    steamId: { type: DataTypes.STRING, allowNull: true, unique: true },
    steamName: { type: DataTypes.STRING, allowNull: true },
    discordId: { type: DataTypes.STRING, allowNull: true, unique: true },
    discordName: { type: DataTypes.STRING, allowNull: true },
    isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    isApproved: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    timestamps: true,
});

// Report 模型
export const Report = sequelize.define('Report', {
    steamId: { type: DataTypes.STRING, allowNull: false },
    steamName: { type: DataTypes.STRING, allowNull: true },
    matchId: { type: DataTypes.STRING, allowNull: true },
    type: {
        type: DataTypes.ENUM('aimbot', 'wallhack', 'griefing', 'other'),
        allowNull: false
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    evidenceUrl: { type: DataTypes.STRING, allowNull: true },
    approved: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    timestamps: true,
});

// 關聯：一個 User 可以有很多 Report
User.hasMany(Report, {
    foreignKey: 'reporterId',
    as: 'reports',       // 這裡可以叫 reports
    onDelete: 'CASCADE',
    hooks: true
});

// Report 對應 User
Report.belongsTo(User, {
    foreignKey: 'reporterId',
    as: 'reporter'       // <-- 這個 alias 一定要跟 include 一致
});

export default { sequelize, User, Report };
