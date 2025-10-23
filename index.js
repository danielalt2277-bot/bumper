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

const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { keys: [], users: [] });

(async () => {
    await db.read();
    db.data = db.data || { keys: [], users: [] };
    await db.write();
})();

const activeBumps = {};
const activeVouches = {};
const activeTrades = {};
const BASE_URL = 'https://discord.com/api/v9';

// --- SAFEGUARDS AND HELPERS ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function safeFetch(url, options) {
    let response = await fetch(url, options);
    while (response.status === 429) {
        const data = await response.json();
        const retryAfter = (data.retry_after * 1000) + 500; // Add 500ms buffer
        console.warn(`[Rate Limit] Waiting for ${retryAfter / 1000}s.`);
        await sleep(retryAfter);
        response = await fetch(url, options);
    }
    return response;
}

function getBumpInterval() {
    // Base interval: 2 hours 15 mins. Jitter: 1 to 6 minutes.
    const baseInterval = (2 * 60 * 60 * 1000) + (15 * 60 * 1000);
    const jitter = (Math.floor(Math.random() * 6) + 1) * 60 * 1000;
    return baseInterval + jitter;
}

const selfBotOptions = {
    checkUpdate: false,
    ws: {
        properties: {
            os: 'Windows',
            browser: 'Discord Client',
            release_channel: 'stable',
            device: '',
        }
    }
};

async function checkToken(token) {
    return new Promise((resolve) => {
        const checkerClient = new SelfBotClient(selfBotOptions);
        const loginTimeout = setTimeout(() => { checkerClient.destroy(); resolve(false); }, 10000);
        checkerClient.on('ready', () => { clearTimeout(loginTimeout); checkerClient.destroy(); resolve(true); });
        checkerClient.login(token).catch(() => { clearTimeout(loginTimeout); checkerClient.destroy(); resolve(false); });
    });
}

// --- BUMP FUNCTIONS ---

async function executeBump(token, channelId) {
    if (!token) return;
    const selfBotClient = new SelfBotClient(selfBotOptions);

    selfBotClient.on('ready', async () => {
        try {
            const channel = await selfBotClient.channels.fetch(channelId);
            if (!channel) {
                console.error(`[AutoBump] Could not find channel ${channelId}.`);
                return;
            }
            await channel.sendSlash('302050872383242240', 'bump');
            console.log(`[AutoBump] Successfully sent bump command in #${channel.name}.`);
        } catch (error) {
            console.error(`[AutoBump] Failed to send bump command:`, error.message);
        } finally {
            selfBotClient.destroy();
        }
    });

    selfBotClient.login(token).catch(err => {
        if (err.message.includes('Incorrect login details')) {
            console.error(`[AutoBump] A token was invalid. It will be removed on the next /tokencheck.`);
        } else {
            console.error(`[AutoBump] Self-bot login failed:`, err.message);
        }
    });
}

function startBumping(userId, channelId, token) {
    if (activeBumps[userId]) clearTimeout(activeBumps[userId].timeout);

    const run = () => {
        const user = db.data.users.find(u => u.id === userId);
        if (!user?.services?.autoBump?.isActive) return;

        executeBump(token, channelId);
        const nextInterval = getBumpInterval();
        console.log(`[AutoBump] Next bump for user ${userId} in ${(nextInterval / (1000 * 60)).toFixed(2)} minutes.`);
        activeBumps[userId] = { timeout: setTimeout(run, nextInterval) };
    };
    run();
}

function stopBumping(userId) {
    if (activeBumps[userId]) {
        clearTimeout(activeBumps[userId].timeout);
        delete activeBumps[userId];
    }
}

// --- VOUCH FUNCTIONS ---

async function sendVouchRequest(token, channelId, body) {
    try {
        const url = `${BASE_URL}/channels/${channelId}/messages`;
        const response = await safeFetch(url, {
            method: 'POST',
            headers: { "authorization": token, "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            console.error(`[AutoVouch] Discord API Error: ${response.status}`);
        } else {
            console.log(`[AutoVouch] Successfully sent vouch message to channel ${channelId}.`);
        }
    } catch (error) {
        console.error("[AutoVouch] Error sending vouch request:", error);
    }
}

function startVouching(userId, channelId, targetUserId) {
    if (activeVouches[userId]) clearTimeout(activeVouches[userId].timeout);

    const run = async () => {
        const user = db.data.users.find(u => u.id === userId);
        if (!user?.services?.autoVouch?.isActive) return;

        try {
            const vouches = fs.readFileSync('vouches.txt', 'utf-8').split('\n').map(v => v.trim()).filter(Boolean);
            const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));
            const userVouches = vouches.filter(v => v.includes(`<@${targetUserId}>`));

            if (!userVouches.length || !tokens.length) {
                console.error("[AutoVouch] No vouches found for the target user or no tokens available. Stopping service.");
                return;
            }

            let vouch = userVouches[Math.floor(Math.random() * userVouches.length)];
            if (userVouches.length > 1) {
                while (vouch === user.services.autoVouch.lastVouch) vouch = userVouches[Math.floor(Math.random() * userVouches.length)];
            }
            user.services.autoVouch.lastVouch = vouch;

            let token = tokens[Math.floor(Math.random() * tokens.length)];
            if (tokens.length > 1) {
                 while (token === user.services.autoVouch.lastToken) token = tokens[Math.floor(Math.random() * tokens.length)];
            }
            user.services.autoVouch.lastToken = token;
            await db.write();

            await sendVouchRequest(token, channelId, { content: vouch });

            const delay = Math.floor(Math.random() * (480000 - 180000 + 1)) + 180000; // 3-8 mins
            console.log(`[AutoVouch] Next vouch for user ${userId} in ${(delay / 60000).toFixed(2)} minutes.`);
            activeVouches[userId] = { timeout: setTimeout(run, delay) };
        } catch (error) {
            console.error("[AutoVouch] A critical error occurred in the vouching loop:", error);
        }
    };
    run();
}

function stopVouching(userId) {
    if (activeVouches[userId]) {
        clearTimeout(activeVouches[userId].timeout);
        delete activeVouches[userId];
    }
}

// --- TRADE FUNCTIONS ---

async function sendTradeRequest(token, channelId, body) {
    try {
        const url = `${BASE_URL}/channels/${channelId}/messages`;
        const response = await safeFetch(url, {
            method: 'POST',
            headers: { "authorization": token, "content-type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            console.error(`[AutoTrade] Discord API Error: ${response.status}`);
        } else {
            console.log(`[AutoTrade] Successfully sent trade message to channel ${channelId}.`);
        }
    } catch (error) {
        console.error("[AutoTrade] Error sending trade request:", error);
    }
}

function startTrading(userId, channelId) {
    if (activeTrades[userId]) clearTimeout(activeTrades[userId].timeout);

    const run = async () => {
        const user = db.data.users.find(u => u.id === userId);
        if (!user?.services?.autotrade?.isActive) return;

        try {
            const messages = fs.readFileSync('tradingmessages.txt', 'utf-8').split('\n').map(v => v.trim()).filter(Boolean);
            const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));

            if (!messages.length || !tokens.length) {
                console.error("[AutoTrade] No messages found in tradingmessages.txt or no tokens available. Stopping service.");
                return;
            }

            let message = messages[Math.floor(Math.random() * messages.length)];
            if (messages.length > 1) {
                while (message === user.services.autotrade.lastMessage) message = messages[Math.floor(Math.random() * messages.length)];
            }
            user.services.autotrade.lastMessage = message;

            let token = tokens[Math.floor(Math.random() * tokens.length)];
            if (tokens.length > 1) {
                 while (token === user.services.autotrade.lastToken) token = tokens[Math.floor(Math.random() * tokens.length)];
            }
            user.services.autotrade.lastToken = token;
            await db.write();

            await sendTradeRequest(token, channelId, { content: message });

            const delay = Math.floor(Math.random() * (480000 - 180000 + 1)) + 180000; // 3-8 mins
            console.log(`[AutoTrade] Next trade message for user ${userId} in ${(delay / 60000).toFixed(2)} minutes.`);
            activeTrades[userId] = { timeout: setTimeout(run, delay) };
        } catch (error) {
            console.error("[AutoTrade] A critical error occurred in the trading loop:", error);
        }
    };
    run();
}

function stopTrading(userId) {
    if (activeTrades[userId]) {
        clearTimeout(activeTrades[userId].timeout);
        delete activeTrades[userId];
    }
}

// --- COMMANDS AND INTERACTIONS ---

const commands = [
    { name: 'auto-bump', description: 'Starts the auto-bumping process.', options: [{ name: 'key', type: 3, description: 'Your license key.', required: true }, { name: 'channel_id', type: 3, description: 'The channel ID for bumping.', required: true }, { name: 'token', type: 3, description: 'Your authorization token.', required: true }] },
    { name: 'autovouch', description: 'Starts the auto-vouching process.', options: [{ name: 'key', type: 3, description: 'Your license key.', required: true }, { name: 'channel_id', type: 3, description: 'The channel ID for vouching.', required: true }, { name: 'user_id', type: 3, description: 'The user ID to vouch for.', required: true }] },
    { name: 'autotrade', description: 'Starts the auto-trading process.', options: [{ name: 'key', type: 3, description: 'Your license key.', required: true }, { name: 'channel_id', type: 3, description: 'The channel ID for trading messages.', required: true }] },
    {
        name: 'key-gen',
        description: 'Generates a new key for a specific service.',
        options: [
            { name: 'user', type: 6, description: 'The user to generate the key for.', required: true },
            { name: 'duration', type: 3, description: 'Duration (e.g., 7d, 1m, 0 for perm).', required: true },
            {
                name: 'service',
                type: 3,
                description: 'The service this key will unlock.',
                required: true,
                choices: [
                    { name: 'Auto-Bump', value: 'autobump' },
                    { name: 'Auto-Vouch', value: 'autovouch' },
                    { name: 'Auto-Trade', value: 'autotrade' }
                ]
            }
        ]
    },
    { name: 'check-keys', description: 'Checks the status of keys.', options: [{ name: 'user', type: 6, description: 'The user to search for.', required: false }] },
    { name: 'manage', description: 'Manage your active services.' },
    { name: 'tokencheck', description: 'Checks and manages all stored tokens.', options: [{ name: 'action', type: 3, description: 'Optional action for invalid tokens.', required: false, choices: [{ name: 'Remove Invalid Tokens', value: 'remove' }] }] }
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application commands.');
    } catch (error) { console.error(error); }
})();

client.on('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    db.data.users.forEach(user => {
        if (user.services?.autoBump?.isActive) startBumping(user.id, user.services.autoBump.channelId, user.services.autoBump.token);
        if (user.services?.autoVouch?.isActive) startVouching(user.id, user.services.autoVouch.channelId, user.services.autoVouch.userId);
        if (user.services?.autotrade?.isActive) startTrading(user.id, user.services.autotrade.channelId);
    });
    console.log(`Restarted active services.`);
});

client.on('interactionCreate', async interaction => {
    const userId = interaction.user.id;
    const findUser = () => db.data.users.find(u => u.id === userId);
    const createUser = () => {
        const newUser = { id: userId, services: {} };
        db.data.users.push(newUser);
        return newUser;
    };

    if (interaction.isCommand()) {
        const { commandName } = interaction;
        if (['auto-bump', 'autovouch', 'autotrade'].includes(commandName)) {
            const key = interaction.options.getString('key');
            const keyData = db.data.keys.find(k => k.key === key);
            const serviceName = commandName.replace('-', '');

            if (!keyData || keyData.isUsed || (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) || keyData.service !== serviceName) {
                return interaction.reply({ content: `This key is invalid, already used, expired, or not for the \`${serviceName}\` service.`, ephemeral: true });
            }
            keyData.isUsed = true;
            keyData.usedBy = userId;
            keyData.usedAt = new Date();
        }

        if (commandName === 'auto-bump') {
            const user = findUser() || createUser();
            user.services.autoBump = { channelId: interaction.options.getString('channel_id'), token: interaction.options.getString('token'), isActive: true };
            await db.write();
            startBumping(userId, user.services.autoBump.channelId, user.services.autoBump.token);
            await interaction.reply({ content: `Auto-bumping has started.`, ephemeral: true });
        } else if (commandName === 'autovouch') {
            const user = findUser() || createUser();
            user.services.autoVouch = { channelId: interaction.options.getString('channel_id'), userId: interaction.options.getString('user_id'), isActive: true, lastVouch: null, lastToken: null };
            await db.write();
            startVouching(userId, user.services.autoVouch.channelId, user.services.autoVouch.userId);
            await interaction.reply({ content: `Auto-vouching has started.`, ephemeral: true });
        } else if (commandName === 'autotrade') {
            const user = findUser() || createUser();
            user.services.autotrade = { channelId: interaction.options.getString('channel_id'), isActive: true, lastMessage: null, lastToken: null };
            await db.write();
            startTrading(userId, user.services.autotrade.channelId);
            await interaction.reply({ content: `Auto-trading has started.`, ephemeral: true });
        } else if (commandName === 'key-gen') {
            if (userId !== '1159088261973692446') return interaction.reply({ content: 'Unauthorized.', ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const service = interaction.options.getString('service');
            const duration = durationStr === '0' ? Infinity : ms(durationStr);

            if (isNaN(duration)) return interaction.reply({ content: 'Invalid duration format.', ephemeral: true });

            const expiresAt = duration === Infinity ? null : new Date(Date.now() + duration);
            const newKey = uuidv4();

            db.data.keys.push({ key: newKey, service: service, generatedBy: userId, generatedAt: new Date(), expiresAt, isUsed: false, usedBy: null, usedAt: null });
            await db.write();

            const embed = new EmbedBuilder()
                .setTitle('Your New License Key')
                .setColor('#00FF00')
                .addFields(
                    { name: 'Service', value: `\`${service}\`` },
                    { name: 'Key', value: `\`${newKey}\`` },
                    { name: 'Expires', value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Never' }
                );

            try {
                await targetUser.send({ embeds: [embed] });
                await interaction.reply({ content: `Successfully generated and sent a ${service} key to ${targetUser.tag}.`, ephemeral: true });
            } catch (error) {
                console.error(`Could not send DM to ${targetUser.tag}.`);
                await interaction.reply({ content: `Could not DM ${targetUser.tag}. The key is: \`${newKey}\``, ephemeral: true });
            }
        } else if (commandName === 'check-keys') {
            if (userId !== '1159088261973692446') return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
            const targetUser = interaction.options.getUser('user');
            if (targetUser) {
                const userKey = db.data.keys.find(k => k.usedBy === targetUser.id);
                if (!userKey) return interaction.reply({ content: `${targetUser.tag} has no key.`, ephemeral: true });
                const embed = new EmbedBuilder().setTitle(`Key Info for ${targetUser.username}`).addFields({ name: 'Key', value: `\`${userKey.key}\`` }, { name: 'Status', value: userKey.isUsed ? 'Used' : 'Not Used' }, { name: 'Expires', value: userKey.expiresAt ? `<t:${Math.floor(new Date(userKey.expiresAt).getTime() / 1000)}:R>` : 'Never' });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`delete_key_${userKey.key}`).setLabel('Delete').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`edit_key_${userKey.key}`).setLabel('Edit Expiry').setStyle(ButtonStyle.Primary));
                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            } else {
                const page = 0;
                const keysPerPage = 5;
                const allKeys = db.data.keys;
                const totalPages = Math.ceil(allKeys.length / keysPerPage) || 1;
                const generateEmbed = (currentPage) => {
                    const keysOnPage = allKeys.slice(currentPage * keysPerPage, (currentPage + 1) * keysPerPage);
                    return new EmbedBuilder().setTitle('All Generated Keys').setDescription(keysOnPage.map(k => `**Key:** \`${k.key}\`\n**Used by:** ${k.usedBy ? `<@${k.usedBy}>` : 'N/A'}\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') || 'No keys.').setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` });
                };
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ck_prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0), new ButtonBuilder().setCustomId('ck_next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1));
                await interaction.reply({ embeds: [generateEmbed(page)], components: [row], ephemeral: true });
            }
        } else if (commandName === 'manage') {
            const user = findUser();
            if (!user || !Object.keys(user.services).length) return interaction.reply({ content: 'You have no services.', ephemeral: true });
            const embed = new EmbedBuilder().setTitle('Service Management');
            const rows = [];
            if (user.services.autoBump) {
                const s = user.services.autoBump;
                embed.addFields({ name: 'Auto-Bump', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_bump_start').setLabel('Start Bump').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_bump_stop').setLabel('Stop Bump').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            if (user.services.autoVouch) {
                const s = user.services.autoVouch;
                embed.addFields({ name: 'Auto-Vouch', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_vouch_start').setLabel('Start Vouch').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_vouch_stop').setLabel('Stop Vouch').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            if (user.services.autotrade) {
                const s = user.services.autotrade;
                embed.addFields({ name: 'Auto-Trade', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_trade_start').setLabel('Start Trade').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_trade_stop').setLabel('Stop Trade').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
        } else if (commandName === 'tokencheck') {
             if (userId !== '1159088261973692446') return interaction.reply({ content: 'Unauthorized.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const dbTokens = db.data.users.filter(u => u.services?.autoBump?.token).map(u => u.services.autoBump.token);
            let rawFileTokens = [];
            try { rawFileTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8')); } catch { }
            const uniqueTokens = [...new Set([...dbTokens, ...rawFileTokens])];
            if (!uniqueTokens.length) return interaction.editReply('No tokens found.');

            const valid = [], invalid = [];
            for (const token of uniqueTokens) { (await checkToken(token) ? valid : invalid).push(token); }

            const embed = new EmbedBuilder().setTitle('Token Check Report').setColor(invalid.length ? '#FF0000' : '#00FF00').addFields({ name: '✅ Valid', value: `${valid.length}`, inline: true }, { name: '❌ Invalid', value: `${invalid.length}`, inline: true });
            if (interaction.options.getString('action') === 'remove' && invalid.length) {
                const newFileTokens = rawFileTokens.filter(t => !invalid.includes(t));
                fs.writeFileSync('tokens.json', JSON.stringify(newFileTokens, null, 2));
                let disabledCount = 0;
                db.data.users.forEach(u => {
                    if (u.services?.autoBump?.token && invalid.includes(u.services.autoBump.token)) {
                        stopBumping(u.id);
                        u.services.autoBump.isActive = false;
                        u.services.autoBump.token = null;
                        disabledCount++;
                    }
                });
                if (disabledCount) await db.write();
                embed.setDescription(`Removed **${rawFileTokens.length - newFileTokens.length}** from \`tokens.json\`.\nDisabled **${disabledCount}** bump services.`);
            } else if (invalid.length) {
                embed.addFields({ name: 'Full Invalid Tokens', value: `\`\`\`${invalid.join('\n').substring(0, 1000)}\`\`\`` });
            }
            await interaction.editReply({ embeds: [embed] });
        }
    } else if (interaction.isButton()) {
        const [action, ...args] = interaction.customId.split('_');

        if (action === 'manage') {
            const user = findUser();
            if (!user) return;

            let serviceName;
            if (args[0] === 'bump') serviceName = 'autoBump';
            else if (args[0] === 'vouch') serviceName = 'autoVouch';
            else if (args[0] === 'trade') serviceName = 'autotrade';

            const operation = args[1];
            const s = user.services[serviceName];
            s.isActive = operation === 'start';

            if (s.isActive) {
                if (serviceName === 'autoBump') startBumping(userId, s.channelId, s.token);
                else if (serviceName === 'autoVouch') startVouching(userId, s.channelId, s.userId);
                else if (serviceName === 'autotrade') startTrading(userId, s.channelId);
            } else {
                if (serviceName === 'autoBump') stopBumping(userId);
                else if (serviceName === 'autoVouch') stopVouching(userId);
                else if (serviceName === 'autotrade') stopTrading(userId);
            }
            await db.write();

            const manageEmbed = new EmbedBuilder().setTitle('Service Management');
            const rows = [];
            if (user.services.autoBump) {
                const s = user.services.autoBump;
                manageEmbed.addFields({ name: 'Auto-Bump', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_bump_start').setLabel('Start Bump').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_bump_stop').setLabel('Stop Bump').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            if (user.services.autoVouch) {
                const s = user.services.autoVouch;
                manageEmbed.addFields({ name: 'Auto-Vouch', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_vouch_start').setLabel('Start Vouch').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_vouch_stop').setLabel('Stop Vouch').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            if (user.services.autotrade) {
                const s = user.services.autotrade;
                manageEmbed.addFields({ name: 'Auto-Trade', value: `Status: **${s.isActive ? 'Active' : 'Inactive'}**` });
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('manage_trade_start').setLabel('Start Trade').setStyle(ButtonStyle.Success).setDisabled(s.isActive), new ButtonBuilder().setCustomId('manage_trade_stop').setLabel('Stop Trade').setStyle(ButtonStyle.Danger).setDisabled(!s.isActive)));
            }
            await interaction.update({ embeds: [manageEmbed], components: rows });
        } else if (action === 'delete' && args[0] === 'key') {
            db.data.keys = db.data.keys.filter(k => k.key !== args[1]);
            await db.write();
            await interaction.update({ content: `Key deleted.`, embeds: [], components: [] });
        } else if (action === 'edit' && args[0] === 'key') {
            const modal = new ModalBuilder().setCustomId(`edit_key_modal_${args[1]}`).setTitle('Edit Key Expiration').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_duration').setLabel('New duration (e.g., 30d, 0 for perm)').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
        } else if (action === 'ck') {
            const embed = interaction.message.embeds[0];
            const footer = embed.footer.text;
            let currentPage = parseInt(footer.match(/(\d+)/g)[0], 10) - 1;
            currentPage += args[0] === 'next' ? 1 : -1;

            const keysPerPage = 5;
            const allKeys = db.data.keys;
            const totalPages = Math.ceil(allKeys.length / keysPerPage) || 1;
            const keysOnPage = allKeys.slice(currentPage * keysPerPage, (currentPage + 1) * keysPerPage);

            const newEmbed = new EmbedBuilder().setTitle('All Generated Keys').setDescription(keysOnPage.map(k => `**Key:** \`${k.key}\`\n**Used by:** ${k.usedBy ? `<@${k.usedBy}>` : 'N/A'}\n**Expires:** ${k.expiresAt ? `<t:${Math.floor(new Date(k.expiresAt).getTime() / 1000)}:R>` : 'Never'}`).join('\n\n') || 'No keys.').setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ck_prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0), new ButtonBuilder().setCustomId('ck_next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages - 1));
            await interaction.update({ embeds: [newEmbed], components: [row] });
        }
    } else if (interaction.isModalSubmit()) {
        const [action, ...args] = interaction.customId.split('_');
        if (action === 'edit' && args[0] === 'key' && args[1] === 'modal') {
            const keyData = db.data.keys.find(k => k.key === args[2]);
            const durationStr = interaction.fields.getTextInputValue('new_duration');
            const duration = durationStr === '0' ? Infinity : ms(durationStr);
            if (isNaN(duration)) return interaction.reply({ content: 'Invalid duration.', ephemeral: true });
            keyData.expiresAt = duration === Infinity ? null : new Date(Date.now() + duration);
            await db.write();
            await interaction.reply({ content: `Key expiration updated.`, ephemeral: true });
        }
    }
});

client.login(process.env.BOT_TOKEN);
