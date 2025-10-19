require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const activeBumps = {};

const MESSAGE_1 = "hi";
const MESSAGE_2 = "hi";
const BASE_URL = 'https://discord.com/api/v9';
const BUMP_INTERVAL = 1800 * 1000; // 30 minutes in milliseconds

async function sendMessage(token, channelId, content) {
    try {
        const response = await fetch(`${BASE_URL}/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
        });

        if (response.ok) {
            console.log(`[${new Date().toLocaleTimeString()}] Sent to ${channelId}`);
        } else {
            console.error(`[ERROR] ${response.status} → ${await response.text()}`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to send message: ${error.message}`);
    }
}

function startBumping(channelId, token) {
    if (activeBumps[channelId]) {
        clearInterval(activeBumps[channelId].interval);
    }

    let msgToggle = false;
    const interval = setInterval(() => {
        const content = msgToggle ? MESSAGE_1 : MESSAGE_2;
        sendMessage(token, channelId, content);
        msgToggle = !msgToggle;
    }, BUMP_INTERVAL);

    activeBumps[channelId] = { interval, token };
}

const commands = [
    {
        name: 'auto-bump',
        description: 'Starts the auto-bumping process for a specific channel.',
        options: [
            {
                name: 'channel_id',
                type: 3, // STRING
                description: 'The ID of the channel to send messages to.',
                required: true,
            },
            {
                name: 'token',
                type: 3, // STRING
                description: 'The authorization token to use for sending messages.',
                required: true,
            },
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'auto-bump') {
        const channelId = interaction.options.getString('channel_id');
        const token = interaction.options.getString('token');

        startBumping(channelId, token);

        await interaction.reply({ content: `Auto-bumping started for channel ${channelId}.`, ephemeral: true });
    }
});

client.login(process.env.BOT_TOKEN);
