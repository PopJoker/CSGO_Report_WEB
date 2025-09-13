const { REST, Routes } = require('discord.js');
const fs = require('fs');

// 讀取 command 檔案
const commandFiles = fs.readdirSync('./discordCommands').filter(f => f.endsWith('.js'));

// Map 用來執行指令
const commandsMap = new Map();

// Array 用來註冊 Slash Command
const commandsArray = [];

for (const file of commandFiles) {
    const command = require(`./discordCommands/${file}`);
    commandsMap.set(command.data.name, command);
    commandsArray.push(command.data.toJSON());
}

// interactionCreate 事件
discordClient.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = commandsMap.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        await interaction.reply({ content: '執行指令失敗', ephemeral: true });
    }
});

// 註冊 Slash Commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commandsArray }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (err) {
        console.error(err);
    }
})();
