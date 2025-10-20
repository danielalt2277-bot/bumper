require('dotenv').config();
const { Client: BotClient, GatewayIntentBits, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Client: SelfBotClient } = require('discord.js-selfbot-v13');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const ms = require('ms');
const path = require('path');
const fs = require('fs');

const client = new BotClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] });

// Database setup
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { keys: [], users: [] }); // Provide default data to the constructor

(async () => {
    await db.read();
    await db.write();
})();

const activeBumps = {};
const activeVouches = {};

const MESSAGE = "hi";
const BASE_URL = 'https://discord.com/api/v9';
const BUMP_INTERVAL = (2 * 60 * 60 + 15 * 60) * 1000; // 2 hours and 15 minutes in milliseconds

async function sendRequest(token, url, method = 'POST', body = null) {
    const headers = {
        "authorization": token,
        "content-type": "application/json",
    };

    try {
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        console.error("Error during request:", error);
        return null;
    }
}

async function executeBump(token, channelId) {
    const selfBotClient = new SelfBotClient();

    return new Promise((resolve) => {
        selfBotClient.on('ready', async () => {
            console.log(`Self-bot logged in as ${selfBotClient.user.tag} for bumping.`);
            try {
                const channel = await selfBotClient.channels.fetch(channelId);
                await channel.sendSlash('302050872383242240', 'bump');
                console.log(`Bump command sent successfully in channel ${channelId} by ${selfBotClient.user.tag}.`);
            } catch (error) {
                console.error(`Failed to send bump command for token ${token.slice(0, 10)}...:`, error.message);
            } finally {
                selfBotClient.destroy();
                resolve();
            }
        });

        selfBotClient.login(token).catch((err) => {
            console.error(`Failed to login with self-bot token ${token.slice(0, 10)}...:`, err.message);
            resolve();
        });
    });
}

function startBumping(channelId, token) {
    if (activeBumps[channelId]) {
        clearInterval(activeBumps[channelId].interval);
    }

    // Execute the first bump immediately
    executeBump(token, channelId);

    const interval = setInterval(() => {
        executeBump(token, channelId);
    }, BUMP_INTERVAL);

    activeBumps[channelId] = { interval, token };
}

function stopBumping(channelId) {
    if (activeBumps[channelId]) {
        clearInterval(activeBumps[channelId].interval);
        delete activeBumps[channelId];
    }
}

function startVouching(userId, channelId, targetUserId) {
    if (activeVouches[userId]) {
        clearTimeout(activeVouches[userId].timeout);
    }

    const run = async () => {
        const user = db.data.users.find(u => u.id === userId);
        if (!user || !user.services.autoVouch || !user.services.autoVouch.isActive) {
            return;
        }

        let vouches, userVouches, tokens;
        try {
            vouches = fs.readFileSync('vouches.txt', 'utf-8').split('\n').map(v => v.trim()).filter(Boolean);
            userVouches = vouches.filter(v => v.includes(`<@${targetUserId}>`));
            tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));
        } catch (error) {
            console.error("Error reading vouches.txt or tokens.json:", error);
            return;
        }

        if (userVouches.length === 0 || tokens.length === 0) {
            console.error("No vouches found for the user or no tokens available.");
            return;
        }

        let vouch = userVouches[Math.floor(Math.random() * userVouches.length)];
        while (vouch === user.services.autoVouch.lastVouch) {
            vouch = userVouches[Math.floor(Math.random() * userVouches.length)];
        }
        user.services.autoVouch.lastVouch = vouch;

        let token = tokens[Math.floor(Math.random() * tokens.length)];
        while (token === user.services.autoVouch.lastToken) {
            token = tokens[Math.floor(Math.random() * tokens.length)];
        }
        user.services.autoVouch.lastToken = token;

        await db.write();

        const url = `${BASE_URL}/channels/${channelId}/messages`;
        await sendRequest(token, url, 'POST', { content: vouch });

        const delay = Math.floor(Math.random() * (7 * 60 * 1000 - 2 * 60 * 1000 + 1)) + 2 * 60 * 1000;
        activeVouches[userId] = { timeout: setTimeout(run, delay) };
    };

    run();
}

function stopVouching(userId) {
    if (activeVouches[userId]) {
        clearTimeout(activeVouches[userId].timeout);
        delete activeVouches[userId];
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
        description: 'Checks the status of generated keys.',
        options: [
            {
                name: 'user',
                type: 6, // USER
                description: 'The user to search for.',
                required: false,
            },
        ],
    },
    {
        name: 'manage',
        description: 'Manage your active services.',
    },
    {
        name: 'autovouch',
        description: 'Starts the auto-vouching process for a specific user.',
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
                description: 'The ID of the channel to send vouches to.',
                required: true,
            },
            {
                name: 'user_id',
                type: 3, // STRING
                description: 'The ID of the user whose vouches you want to send.',
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

client.on('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    restartActiveBumps();
    restartActiveVouches();
});

function restartActiveBumps() {
    const activeUsers = db.data.users.filter(u => u.services && u.services.autoBump && u.services.autoBump.isActive);
    for (const user of activeUsers) {
        startBumping(user.services.autoBump.channelId, user.services.autoBump.token);
    }
    console.log(`Restarted ${activeUsers.length} active bumps.`);
}

function restartActiveVouches() {
    const activeUsers = db.data.users.filter(u => u.services && u.services.autoVouch && u.services.autoVouch.isActive);
    for (const user of activeUsers) {
        startVouching(user.id, user.services.autoVouch.channelId, user.services.autoVouch.userId);
    }
    console.log(`Restarted ${activeUsers.length} active vouches.`);
}

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
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
                user.services = user.services || {};
                user.services.autoBump = {
                    channelId,
                    token,
                    isActive: true,
                };
            } else {
                db.data.users.push({
                    id: interaction.user.id,
                    services: {
                        autoBump: {
                            channelId,
                            token,
                            isActive: true,
                        },
                    },
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

            const targetUser = interaction.options.getUser('user');

            if (targetUser) {
                const userKey = db.data.keys.find(k => k.usedBy === targetUser.id);
                if (!userKey) {
                    return interaction.reply({ content: `${targetUser.tag} has not used a key.`, ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Key Information for ${targetUser.username}`)
                    .addFields(
                        { name: 'Key', value: `\`${userKey.key}\`` },
                        { name: 'Status', value: userKey.isUsed ? 'Used' : 'Not Used' },
                        { name: 'Expires', value: userKey.expiresAt ? `<t:${Math.floor(new Date(userKey.expiresAt).getTime() / 1000)}:R>` : 'Never' }
                    )
                    .setColor(userKey.isUsed ? '#FF0000' : '#FFFF00');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`delete_key_${userKey.key}`)
                        .setLabel('Delete Key')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`edit_key_${userKey.key}`)
                        .setLabel('Change Expiration')
                        .setStyle(ButtonStyle.Primary)
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

            } else {
                const page = 0;
                const keysPerPage = 5;
                const allKeys = db.data.keys;
                const totalPages = Math.ceil(allKeys.length / keysPerPage) || 1;

                const generateEmbed = (page) => {
                    const start = page * keysPerPage;
                    const end = start + keysPerPage;
                    const keysOnPage = allKeys.slice(start, end);
                    return new EmbedBuilder()
                        .setTitle('All Generated Keys')
                        .setDescription(keysOnPage.map(k => `**Key:** \`${k.key}\`\n**Used by:** ${k.usedBy ? `<@${k.usedBy}>` : 'N/A'}\n**Status:** ${k.isUsed ? 'Used' : 'Unused'}\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') || 'No keys to display.')
                        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
                };

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ck_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('ck_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(totalPages <= 1)
                );

                await interaction.reply({ embeds: [generateEmbed(page)], components: [row], ephemeral: true });
            }
        } else if (commandName === 'manage') {
            const user = db.data.users.find(u => u.id === interaction.user.id);

            if (!user || !user.services) {
                return interaction.reply({ content: 'You have not activated any services yet.', ephemeral: true });
            }

            const autoBumpService = user.services.autoBump;
            const autoVouchService = user.services.autoVouch;

            const embed = new EmbedBuilder()
                .setTitle('Service Management')
                .setDescription('Manage your active services below.');

            const rows = [];

            if (autoBumpService) {
                embed.addFields({
                    name: 'Auto-Bump Service',
                    value: `Status: **${autoBumpService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoBumpService.channelId}>`,
                });
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('manage_autobump_start').setLabel('Start Bump').setStyle(ButtonStyle.Success).setDisabled(autoBumpService.isActive),
                    new ButtonBuilder().setCustomId('manage_autobump_stop').setLabel('Stop Bump').setStyle(ButtonStyle.Danger).setDisabled(!autoBumpService.isActive)
                ));
            }

            if (autoVouchService) {
                embed.addFields({
                    name: 'Auto-Vouch Service',
                    value: `Status: **${autoVouchService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoVouchService.channelId}>\nUser: <@${autoVouchService.userId}>`,
                });
                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('manage_autovouch_start').setLabel('Start Vouch').setStyle(ButtonStyle.Success).setDisabled(autoVouchService.isActive),
                    new ButtonBuilder().setCustomId('manage_autovouch_stop').setLabel('Stop Vouch').setStyle(ButtonStyle.Danger).setDisabled(!autoVouchService.isActive)
                ));
            }

            await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
        } else if (commandName === 'autovouch') {
            const key = interaction.options.getString('key');
            const channelId = interaction.options.getString('channel_id');
            const userId = interaction.options.getString('user_id');

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
                user.services = user.services || {};
                user.services.autoVouch = {
                    channelId,
                    userId,
                    isActive: true,
                    lastVouch: null,
                    lastToken: null,
                };
            } else {
                db.data.users.push({
                    id: interaction.user.id,
                    services: {
                        autoVouch: {
                            channelId,
                            userId,
                            isActive: true,
                            lastVouch: null,
                            lastToken: null,
                        },
                    },
                });
            }
            await db.write();

            startVouching(interaction.user.id, channelId, userId);
            await interaction.reply({ content: `Auto-vouching has started for user ${userId} in channel ${channelId}.`, ephemeral: true });
        }
        }
    } else if (interaction.isButton()) {
            const [action, ...args] = interaction.customId.split('_');

            if (action === 'manage' && args[0] === 'autobump') {
                const operation = args[1];
            const user = db.data.users.find(u => u.id === interaction.user.id);
            const autoBumpService = user.services.autoBump;

            if (operation === 'start') {
                autoBumpService.isActive = true;
                startBumping(autoBumpService.channelId, autoBumpService.token);
            } else if (operation === 'stop') {
                autoBumpService.isActive = false;
                stopBumping(autoBumpService.channelId);
            }
            await db.write();

                // Regeneration of the embed and buttons
            const embed = new EmbedBuilder()
                .setTitle('Service Management')
                .setDescription('Manage your active services below.')
                .addFields({
                    name: 'Auto-Bump Service',
                    value: `Status: **${autoBumpService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoBumpService.channelId}>`,
                })
                .setColor(autoBumpService.isActive ? '#00FF00' : '#FF0000');

            const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('manage_autobump_start').setLabel('Start').setStyle(ButtonStyle.Success).setDisabled(autoBumpService.isActive),
                    new ButtonBuilder().setCustomId('manage_autobump_stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setDisabled(!autoBumpService.isActive)
            );

            await interaction.update({ embeds: [embed], components: [row] });
            } else if (action === 'manage' && args[0] === 'autovouch') {
                const operation = args[1];
                const user = db.data.users.find(u => u.id === interaction.user.id);
                const autoVouchService = user.services.autoVouch;

                if (operation === 'start') {
                    autoVouchService.isActive = true;
                    startVouching(user.id, autoVouchService.channelId, autoVouchService.userId);
                } else if (operation === 'stop') {
                    autoVouchService.isActive = false;
                    stopVouching(user.id);
                }
                await db.write();

                // Re-generate the full management embed
                const autoBumpService = user.services.autoBump;
                const embed = new EmbedBuilder()
                    .setTitle('Service Management')
                    .setDescription('Manage your active services below.');
                const rows = [];
                if (autoBumpService) {
                    embed.addFields({ name: 'Auto-Bump Service', value: `Status: **${autoBumpService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoBumpService.channelId}>` });
                    rows.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('manage_autobump_start').setLabel('Start Bump').setStyle(ButtonStyle.Success).setDisabled(autoBumpService.isActive),
                        new ButtonBuilder().setCustomId('manage_autobump_stop').setLabel('Stop Bump').setStyle(ButtonStyle.Danger).setDisabled(!autoBumpService.isActive)
                    ));
                }
                if (autoVouchService) {
                    embed.addFields({ name: 'Auto-Vouch Service', value: `Status: **${autoVouchService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoVouchService.channelId}>\nUser: <@${autoVouchService.userId}>` });
                    rows.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('manage_autovouch_start').setLabel('Start Vouch').setStyle(ButtonStyle.Success).setDisabled(autoVouchService.isActive),
                        new ButtonBuilder().setCustomId('manage_autovouch_stop').setLabel('Stop Vouch').setStyle(ButtonStyle.Danger).setDisabled(!autoVouchService.isActive)
                    ));
                }
                await interaction.update({ embeds: [embed], components: rows });
            } else if (action === 'delete' && args[0] === 'key') {
                const keyToDelete = args[1];
                db.data.keys = db.data.keys.filter(k => k.key !== keyToDelete);
                await db.write();
                await interaction.update({ content: `Key \`${keyToDelete}\` has been deleted.`, embeds: [], components: [] });
            } else if (action === 'edit' && args[0] === 'key') {
                const keyToEdit = args[1];
                const modal = new ModalBuilder()
                    .setCustomId(`edit_key_modal_${keyToEdit}`)
                    .setTitle('Edit Key Expiration')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('new_duration')
                                .setLabel('New Duration (e.g., 30d, 1y, 0 for perm)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            } else if (action === 'ck') {
                const direction = args[0]; // 'prev' or 'next'
                const embed = interaction.message.embeds[0];
                const footerText = embed.footer.text;
                const [currentPageStr, totalPagesStr] = footerText.match(/(\d+)/g);
                let currentPage = parseInt(currentPageStr, 10) - 1;
                const totalPages = parseInt(totalPagesStr, 10);

                if (direction === 'next') {
                    currentPage++;
                } else if (direction === 'prev') {
                    currentPage--;
                }

                const keysPerPage = 5;
                const allKeys = db.data.keys;

                const generateEmbed = (page) => {
                    const start = page * keysPerPage;
                    const end = start + keysPerPage;
                    const keysOnPage = allKeys.slice(start, end);
                    return new EmbedBuilder()
                        .setTitle('All Generated Keys')
                        .setDescription(keysOnPage.map(k => `**Key:** \`${k.key}\`\n**Used by:** ${k.usedBy ? `<@${k.usedBy}>` : 'N/A'}\n**Status:** ${k.isUsed ? 'Used' : 'Unused'}\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') || 'No keys to display.')
                        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
                };

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ck_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage === 0),
                    new ButtonBuilder()
                        .setCustomId('ck_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentPage >= totalPages - 1)
                );

                await interaction.update({ embeds: [generateEmbed(currentPage)], components: [row] });
            }
        } else if (interaction.isModalSubmit()) {
            const [action, ...args] = interaction.customId.split('_');

            if (action === 'edit' && args[0] === 'key' && args[1] === 'modal') {
                const keyToEdit = args[2];
                const newDurationString = interaction.fields.getTextInputValue('new_duration');
                const newDuration = newDurationString === '0' ? Infinity : ms(newDurationString);

                if (isNaN(newDuration)) {
                    return interaction.reply({ content: 'Invalid duration format.', ephemeral: true });
                }

                const keyData = db.data.keys.find(k => k.key === keyToEdit);
                keyData.expiresAt = newDuration === Infinity ? null : new Date(Date.now() + newDuration);
                await db.write();

                await interaction.reply({ content: `Key \`${keyToEdit}\` has been updated.`, ephemeral: true });
        }
    }
});

client.login(process.env.BOT_TOKEN);
