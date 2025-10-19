require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const ms = require('ms');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

// Database setup
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function setupDatabase() {
    await db.read();
    db.data ||= { keys: [], users: [] };
    await db.write();
}
setupDatabase();

const activeBumps = {};

const MESSAGE = "hi";
const BASE_URL = 'https://discord.com/api/v9';
const BUMP_INTERVAL = (2 * 60 * 60 + 60) * 1000; // 2 hours and 1 minute in milliseconds

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

    // Send the first message immediately
    sendMessage(token, channelId, MESSAGE);

    const interval = setInterval(() => {
        sendMessage(token, channelId, MESSAGE);
    }, BUMP_INTERVAL);

    activeBumps[channelId] = { interval, token };
}

function stopBumping(channelId) {
    if (activeBumps[channelId]) {
        clearInterval(activeBumps[channelId].interval);
        delete activeBumps[channelId];
    }
}

const commands = [
    {
        name: 'auto-bump',
        description: 'Starts the auto-bumping process for a specific channel.',
        options: [
            {
                name: 'key',
                type: 3, // STRING
                description: 'Your license key.',
                required: true,
            },
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
    {
        name: 'key-gen',
        description: 'Generates a new key for a user.',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to generate the key for.',
                required: true,
            },
            {
                name: 'duration',
                type: 3, // STRING
                description: 'The duration of the key (e.g., 1d, 7d, 1m, 1y, 0 for permanent).',
                required: true,
            },
        ],
    },
    {
        name: 'check-keys',
        description: 'Checks the status of all generated keys.',
    },
    {
        name: 'manage',
        description: 'Manage your auto-bumping settings.',
        options: [
            {
                name: 'action',
                type: 3, // STRING
                description: 'The action to perform.',
                required: true,
                choices: [
                    { name: 'start', value: 'start' },
                    { name: 'stop', value: 'stop' },
                ],
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
    restartActiveBumps();
});

function restartActiveBumps() {
    const activeUsers = db.data.users.filter(u => u.isActive);
    for (const user of activeUsers) {
        startBumping(user.channelId, user.token);
    }
    console.log(`Restarted ${activeUsers.length} active bumps.`);
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'auto-bump') {
        const key = interaction.options.getString('key');
        const channelId = interaction.options.getString('channel_id');
        const token = interaction.options.getString('token');

        const keyData = db.data.keys.find(k => k.key === key);

        if (!keyData) {
            return interaction.reply({ content: 'Invalid key.', ephemeral: true });
        }
        if (keyData.isUsed) {
            return interaction.reply({ content: 'This key has already been used.', ephemeral: true });
        }
        if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
            return interaction.reply({ content: 'This key has expired.', ephemeral: true });
        }

        keyData.isUsed = true;
        keyData.usedBy = interaction.user.id;
        keyData.usedAt = new Date();

        let user = db.data.users.find(u => u.id === interaction.user.id);
        if (user) {
            user.channelId = channelId;
            user.token = token;
            user.isActive = true;
        } else {
            db.data.users.push({
                id: interaction.user.id,
                channelId,
                token,
                isActive: true,
            });
        }
        await db.write();

        startBumping(channelId, token);
        await interaction.reply({ content: `Your key has been activated! Auto-bumping has started for channel ${channelId}.`, ephemeral: true });

    } else if (commandName === 'key-gen') {
        if (interaction.user.id !== '1159088261973692446') {
            return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const durationString = interaction.options.getString('duration');
        const duration = durationString === '0' ? Infinity : ms(durationString);

        if (isNaN(duration)) {
            return interaction.reply({ content: 'Invalid duration format. Use formats like `1d`, `7d`, `1m`, `1y`, or `0` for permanent.', ephemeral: true });
        }

        const key = uuidv4();
        const expiresAt = duration === Infinity ? null : new Date(Date.now() + duration);

        db.data.keys.push({
            key,
            generatedBy: interaction.user.id,
            generatedAt: new Date(),
            expiresAt,
            isUsed: false,
            usedBy: null,
            usedAt: null,
        });
        await db.write();

        const embed = new EmbedBuilder()
            .setTitle('Your New License Key')
            .setDescription('You have been granted a new license key! Use it with the `/auto-bump` command.')
            .addFields(
                { name: 'Your Key', value: `\`${key}\`` },
                { name: 'Expires', value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Never' }
            )
            .setColor('#00FF00')
            .setTimestamp();

        try {
            await targetUser.send({ embeds: [embed] });
            await interaction.reply({ content: `Successfully generated and sent a key to ${targetUser.tag}.`, ephemeral: true });
        } catch (error) {
            console.error(`Could not send DM to ${targetUser.tag}.`);
            await interaction.reply({ content: `Could not send a DM to ${targetUser.tag}. They may have DMs disabled. The key is: \`${key}\``, ephemeral: true });
        }
    } else if (commandName === 'check-keys') {
        if (interaction.user.id !== '1159088261973692446') {
            return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        }

        const usedKeys = db.data.keys.filter(k => k.isUsed);
        const unusedKeys = db.data.keys.filter(k => !k.isUsed);

        const usedKeysEmbed = new EmbedBuilder()
            .setTitle('Used Keys')
            .setColor('#FF0000')
            .setDescription(usedKeys.length > 0 ? usedKeys.map(k => `**Key:** \`${k.key}\`\n**Used by:** <@${k.usedBy}>\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') : 'No keys have been used.');

        const unusedKeysEmbed = new EmbedBuilder()
            .setTitle('Unused Keys')
            .setColor('#FFFF00')
            .setDescription(unusedKeys.length > 0 ? unusedKeys.map(k => `**Key:** \`${k.key}\`\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') : 'No unused keys.');

        await interaction.reply({ embeds: [usedKeysEmbed, unusedKeysEmbed], ephemeral: true });
    } else if (commandName === 'manage') {
        const action = interaction.options.getString('action');
        const user = db.data.users.find(u => u.id === interaction.user.id);

        if (!user) {
            return interaction.reply({ content: 'You have not set up auto-bumping yet. Use `/auto-bump` with a valid key first.', ephemeral: true });
        }

        if (action === 'start') {
            if (user.isActive) {
                return interaction.reply({ content: 'Auto-bumping is already active.', ephemeral: true });
            }
            user.isActive = true;
            await db.write();
            startBumping(user.channelId, user.token);
            await interaction.reply({ content: 'Auto-bumping has been resumed.', ephemeral: true });
        } else if (action === 'stop') {
            if (!user.isActive) {
                return interaction.reply({ content: 'Auto-bumping is already stopped.', ephemeral: true });
            }
            user.isActive = false;
            await db.write();
            stopBumping(user.channelId);
            await interaction.reply({ content: 'Auto-bumping has been stopped.', ephemeral: true });
        }
    }
});

client.login(process.env.BOT_TOKEN);
