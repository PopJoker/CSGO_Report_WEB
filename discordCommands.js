// discordCommands.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('查詢檢舉紀錄')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('玩家 SteamName 或 ID')
                .setRequired(true)
        ),
    async execute(interaction) {
        const query = interaction.options.getString('query');

        try {
            // 呼叫後端 API
            const resp = await axios.get(`${process.env.API_BASE_URL}/reports?query=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${process.env.API_BOT_TOKEN}` } // 後端需驗證用
            });

            if (!resp.data || resp.data.length === 0) {
                return interaction.reply({ content: `找不到檢舉紀錄: ${query}`, ephemeral: true });
            }

            // 取第一筆資料
            const report = resp.data[0];

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
            console.error('查詢檢舉失敗:', err.message);
            interaction.reply({ content: '查詢檢舉失敗', ephemeral: true });
        }
    }
};
