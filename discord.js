const { MessageEmbed } = require('discord.js');

app.post('/notify/new-report', async (req, res) => {
    const { steamId, type, reportId, mediaUrl } = req.body;
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);

    const embed = new MessageEmbed()
        .setTitle('新檢舉待審核！')
        .setDescription(`SteamID: ${steamId}\n類型: ${type}`)
        .setURL(`https://yourweb.com/admin/reports/${reportId}`)
        .setColor('RED');

    if (mediaUrl) {
        // 如果是影片，Discord 可以直接貼上連結
        if (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.mov')) {
            embed.addField('影片連結', `[點我觀看](${mediaUrl})`);
        } else {
            // 如果是圖片
            embed.setImage(mediaUrl);
        }
    }

    channel.send({ embeds: [embed] });
    res.sendStatus(200);
});
