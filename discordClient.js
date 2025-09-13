// discordClient.js
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Colors } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    console.log(`Discord Bot 已連線: ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);

// 在 discordClient.js
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'report') {
        const query = interaction.options.getString('query');
        try {
            const resp = await axios.get(`${process.env.API_BASE_URL}/reports?query=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${YOUR_BEARER_TOKEN}` }
            });

            if (!resp.data.length) return interaction.reply({ content: `找不到檢舉: ${query}`, ephemeral: true });

            const report = resp.data[0]; // 假設只取第一筆
            const embed = new EmbedBuilder()
                .setTitle(report.approved ? '檢舉已核准 ✅' : '檢舉待審 ⚠️')
                .addFields(
                    { name: '檢舉 ID', value: report.id.toString(), inline: true },
                    { name: '被檢舉玩家 SteamID', value: report.steamId || '無', inline: true },
                    { name: '檢舉類型', value: report.type || '無', inline: true },
                    { name: '描述', value: report.description || '無' },
                    { name: '檢舉人', value: `${report.reporter?.username || '未知'} (${report.reporter?.steamName || '無'})` },
                    { name: '證據', value: report.evidenceUrl || '無' }
                )
                .setColor(report.approved ? 'Green' : 'Yellow')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            interaction.reply({ content: '查詢失敗', ephemeral: true });
        }
    }
});




module.exports = {
    client,
    sendPopMessage
};
