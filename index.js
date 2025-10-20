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

const MESSAGE = "hi";
const BASE_URL = 'https://discord.com/api/v9';
const BUMP_INTERVAL = (2 * 60 * 60 + 15 * 60) * 1000; // 2 hours and 15 minutes in milliseconds

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

async function joinServer(token, inviteCode) {
    const selfBotClient = new SelfBotClient();
    return new Promise((resolve) => {
        selfBotClient.on('ready', async () => {
            try {
                await selfBotClient.acceptInvite(inviteCode);
                console.log(`Token ${token.slice(0, 10)}... successfully joined the server.`);
                resolve(true);
            } catch (error) {
                console.error(`Token ${token.slice(0, 10)}... failed to join:`, error.message);
                resolve(false);
            } finally {
                selfBotClient.destroy();
            }
        });

        selfBotClient.login(token).catch((err) => {
            console.error(`Failed to login with self-bot token ${token.slice(0, 10)}...:`, err.message);
            resolve(false);
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
        name: 'join',
        description: 'Makes all auto-bump users join a server.',
        options: [
            {
                name: 'invite_link',
                type: 3, // STRING
                description: 'The invite link to the server.',
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
});

function restartActiveBumps() {
    const activeUsers = db.data.users.filter(u => u.services && u.services.autoBump && u.services.autoBump.isActive);
    for (const user of activeUsers) {
        startBumping(user.services.autoBump.channelId, user.services.autoBump.token);
    }
    console.log(`Restarted ${activeUsers.length} active bumps.`);
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

            if (!user || !user.services || !user.services.autoBump) {
                return interaction.reply({ content: 'You have not activated any services yet. Use `/auto-bump` with a valid key first.', ephemeral: true });
            }

            const autoBumpService = user.services.autoBump;

            const embed = new EmbedBuilder()
                .setTitle('Service Management')
                .setDescription('Manage your active services below.')
                .addFields({
                    name: 'Auto-Bump Service',
                    value: `Status: **${autoBumpService.isActive ? 'Active' : 'Inactive'}**\nChannel: <#${autoBumpService.channelId}>`,
                })
                .setColor(autoBumpService.isActive ? '#00FF00' : '#FF0000');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('manage_autobump_start')
                    .setLabel('Start')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(autoBumpService.isActive),
                new ButtonBuilder()
                    .setCustomId('manage_autobump_stop')
                    .setLabel('Stop')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!autoBumpService.isActive)
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else if (commandName === 'join') {
            if (interaction.user.id !== '1159088261973692446') {
                return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
            }

            const inviteLink = interaction.options.getString('invite_link');
            const inviteCode = inviteLink.split('/').pop();

            await interaction.reply({ content: 'Starting to join users to the server...', ephemeral: true });

            const dbTokens = db.data.users
                .filter(u => u.services && u.services.autoBump && u.services.autoBump.token)
                .map(u => u.services.autoBump.token);

            let fileTokens = [];
            try {
                const tokensFile = fs.readFileSync('tokens.json');
                fileTokens = JSON.parse(tokensFile);
            } catch (error) {
                console.error('Could not read or parse tokens.json:', error);
            }

            const allTokens = [...new Set([...dbTokens, ...fileTokens])];
            let joinedCount = 0;

            for (const token of allTokens) {
                const success = await joinServer(token, inviteCode);
                if (success) {
                    joinedCount++;
                }
            }

            await interaction.followUp({ content: `Finished. ${joinedCount} tokens were used to join the server.`, ephemeral: true });
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
