require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const app = express();
app.use(bodyParser.json());

// Discord command prefix
const PREFIX = '!';

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Discord 指令處理
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [command, ...args] = message.content.trim().substring(PREFIX.length).split(/\s+/);

    if (command === 'report') {
        message.reply(`點擊這裡提交檢舉: https://yourweb.com/report`);
    }

    if (command === 'check') {
        if (args.length === 0) return message.reply('請輸入 SteamID，例如: !check 123456789');
        const steamId = args[0];

        try {
            const res = await axios.get(`http://localhost:5000/reports?steamId=${steamId}`);
            const reports = res.data;

            if (reports.length === 0) {
                message.reply(`SteamID ${steamId} 沒有檢舉紀錄`);
            } else {
                let text = `SteamID ${steamId} 的檢舉紀錄:\n`;
                reports.forEach(r => {
                    text += `• ID: ${r.id}, 類型: ${r.type}, 核准: ${r.approved ? '是' : '否'}\n`;
                    if (r.mediaUrl) text += `  [媒體](${r.mediaUrl})\n`;
                });
                message.reply(text);
            }
        } catch (err) {
            console.error(err);
            message.reply('查詢失敗，請稍後再試');
        }
    }
});

// Webhook API - 新檢舉通知
app.post('/notify/new-report', async (req, res) => {
    const { steamId, type, reportId, mediaUrl } = req.body;
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle('🚨 新檢舉待審核！')
        .setDescription(`SteamID: ${steamId}\n類型: ${type}`)
        .setURL(`https://yourweb.com/admin/reports/${reportId}`)
        .setColor(0xff0000)
        .setTimestamp();

    if (mediaUrl) {
        if (mediaUrl.match(/\.(mp4|mov|webm)$/i)) {
            embed.addFields({ name: '影片', value: `[點我觀看](${mediaUrl})` });
        } else {
            embed.setImage(mediaUrl);
        }
    }

    channel.send({ embeds: [embed] });
    res.sendStatus(200);
});

// Webhook API - 核准通知
app.post('/notify/approved', async (req, res) => {
    const { steamId, reportId } = req.body;
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle('✅ 檢舉已核准')
        .setDescription(`SteamID: ${steamId}`)
        .setURL(`https://yourweb.com/admin/reports/${reportId}`)
        .setColor(0x00ff00)
        .setTimestamp();

    channel.send({ embeds: [embed] });
    res.sendStatus(200);
});

app.listen(3001, () => console.log('Webhook server running on port 3001'));

client.login(process.env.DISCORD_TOKEN);
