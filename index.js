require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

let serverOffline = false;
let updateInterval = 5 * 60 * 1000; // Default to 5 minutes
let smartInterval;

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('ULTIMATE RP', { type: 'PLAYING' });

    const startInterval = () => {
        clearTimeout(smartInterval);
        smartInterval = setTimeout(() => {
            updatePanels();
            startInterval();
        }, updateInterval);
    };

    updatePanels();
    startInterval();
});

async function updatePanels() {
    let config;
    try {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } catch {
        return; // No config, no panels to update
    }

    // Update Ticket Leaderboard
    if (config.ticketLeaderboard) {
        try {
            const channel = await client.channels.fetch(config.ticketLeaderboard.channelId);
            const message = await channel.messages.fetch(config.ticketLeaderboard.messageId);

            let ticketCounts;
            try {
                ticketCounts = JSON.parse(fs.readFileSync('ticketCounts.json', 'utf8'));
            } catch {
                ticketCounts = {};
            }

            const sortedUsers = Object.entries(ticketCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

            const embed = new BrandedEmbedBuilder()
                .setTitle('Ticket Leaderboard')
                .setDescription(sortedUsers.map(([userId, count], index) => `${index + 1}. <@${userId}>: ${count} tickets`).join('\n') || 'No tickets claimed yet.')
                .setTimestamp();

            await message.edit({ embeds: [embed] });
        } catch (error) {
            console.error('Error updating ticket leaderboard:', error);
        }
    }

    // Update Top Players Panel
    if (config.topPlayersPanel) {
        try {
            const channel = await client.channels.fetch(config.topPlayersPanel.channelId);
            const message = await channel.messages.fetch(config.topPlayersPanel.messageId);

            try {
                const { body } = await request('http://141.226.242.24:30120/players.json');
                const players = await body.json();

                const sortedPlayers = players.sort((a, b) => a.id - b.id).slice(0, 10);

                const embed = new BrandedEmbedBuilder()
                    .setTitle('Top 10 Players')
                    .setDescription(sortedPlayers.map((player, index) => `${index + 1}. ${player.name} (ID: ${player.id})`).join('\n') || 'No players online.')
                    .setTimestamp();

                await message.edit({ embeds: [embed] });
            } catch {
                const embed = new BrandedEmbedBuilder()
                    .setTitle('Top 10 Players')
                    .setDescription('Could not fetch player information.')
                    .setColor('Red')
                    .setTimestamp();
                await message.edit({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error updating top players panel:', error);
        }
    }

    // Update Server Status Panel
    if (config.serverStatusPanel) {
        try {
            const channel = await client.channels.fetch(config.serverStatusPanel.channelId);
            const message = await channel.messages.fetch(config.serverStatusPanel.messageId);

            try {
                const { body: playerBody } = await request('http://141.226.242.24:30120/players.json');
                const players = await playerBody.json();

                const { body: infoBody } = await request('http://141.226.242.24:30120/info.json');
                const serverInfo = await infoBody.json();

                const maxPlayers = serverInfo.vars.sv_maxClients;

                const embed = new BrandedEmbedBuilder()
                    .setTitle('FiveM Server Status')
                    .addFields(
                        { name: 'Status', value: 'Online', inline: true },
                        { name: 'Players', value: `${players.length}/${maxPlayers}`, inline: true }
                    )
                    .setColor('Green')
                    .setTimestamp();

                await message.edit({ embeds: [embed] });
                serverOffline = false;
            } catch {
                const embed = new BrandedEmbedBuilder()
                    .setTitle('FiveM Server Status')
                    .addFields({ name: 'Status', value: 'Offline' })
                    .setColor('Red')
                    .setTimestamp();
                await message.edit({ embeds: [embed] });
                serverOffline = true;
            }
        } catch (error) {
            console.error('Error updating server status panel:', error);
        }
    }

    if (serverOffline) {
        updateInterval = 60 * 1000; // 1 minute
    } else {
        updateInterval = 5 * 60 * 1000; // 5 minutes
    }
}

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const BrandedEmbedBuilder = require('./utils/embedBuilder');
const { request } = require('undici');

const hangmanGames = new Map();
const userMessages = new Map();

async function log(guild, message, logType) {
    let config;
    try {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } catch {
        return; // No config, no logging
    }

    if (!config.logChannels) return;

    const logChannelId = config.logChannels[logType];
    if (logChannelId) {
        const logChannel = await guild.channels.fetch(logChannelId);
        if (logChannel) {
            const embed = new BrandedEmbedBuilder()
                .setDescription(message)
                .setTimestamp();
            logChannel.send({ embeds: [embed] });
        }
    }
}

client.on('rateLimit', (rateLimitInfo) => {
    console.log('Rate limit hit:', rateLimitInfo);
    log(null, `Rate limit hit: ${JSON.stringify(rateLimitInfo)}`, 'command');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Anti-spam
    if (userMessages.has(message.author.id)) {
        const userData = userMessages.get(message.author.id);
        const { lastMessage, timer } = userData;
        const difference = message.createdTimestamp - lastMessage.createdTimestamp;
        let msgCount = userData.msgCount;

        if (difference > 2000) {
            clearTimeout(timer);
            userData.msgCount = 1;
            userData.lastMessage = message;
            userData.timer = setTimeout(() => {
                userMessages.delete(message.author.id);
            }, 5000);
            userMessages.set(message.author.id, userData);
        }
        else {
            msgCount++;
            if (msgCount >= 5) {
                message.member.timeout(10 * 60 * 1000, 'Spamming');
                message.channel.send(`${message.author}, you have been muted for spamming.`);
            }
            userData.msgCount = msgCount;
            userMessages.set(message.author.id, userData);
        }
    }
    else {
        let fn = setTimeout(() => {
            userMessages.delete(message.author.id);
        }, 5000);
        userMessages.set(message.author.id, {
            msgCount: 1,
            lastMessage: message,
            timer: fn
        });
    }

    // Anti-link
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    let config;
    try {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    } catch {
        return;
    }
    if (config && config.staffRoleId && linkRegex.test(message.content) && !message.member.roles.cache.has(config.staffRoleId)) {
        message.delete();
        message.channel.send(`${message.author}, you are not allowed to send links.`);
    }


    if (!hangmanGames.has(message.channel.id)) return;

    const game = hangmanGames.get(message.channel.id);
    const guess = message.content.toLowerCase();

    if (guess.length !== 1 || !/[a-z]/.test(guess)) {
        return;
    }

    if (game.guessedLetters.has(guess)) {
        return message.reply('You already guessed that letter!');
    }

    game.guessedLetters.add(guess);

    if (game.word.includes(guess)) {
        const wordDisplay = game.word.split('').map(letter => (game.guessedLetters.has(letter) ? letter : '_')).join(' ');
        if (!wordDisplay.includes('_')) {
            hangmanGames.delete(message.channel.id);
            return message.channel.send(`Congratulations! You guessed the word: **${game.word}**`);
        }
        message.channel.send(`Correct! The word is: \`${wordDisplay}\``);
    } else {
        game.incorrectGuesses++;
        const remainingGuesses = game.maxIncorrectGuesses - game.incorrectGuesses;
        if (remainingGuesses <= 0) {
            hangmanGames.delete(message.channel.id);
            return message.channel.send(`You lost! The word was: **${game.word}**`);
        }
        message.channel.send(`Incorrect! You have ${remainingGuesses} guesses left.`);
    }
});

client.on('interactionCreate', async interaction => {
    try {
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'application') {
            const name = interaction.fields.getTextInputValue('name');
            const age = interaction.fields.getTextInputValue('age');
            const reason = interaction.fields.getTextInputValue('reason');

            let config;
            try {
                config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            } catch {
                return interaction.reply({ content: 'Review channel not set.', ephemeral: true });
            }

            const reviewChannel = interaction.guild.channels.cache.get(config.reviewChannelId);
            if (!reviewChannel) {
                return interaction.reply({ content: 'Review channel not found.', ephemeral: true });
            }

            const embed = new BrandedEmbedBuilder()
                .setTitle('New Application')
                .addFields(
                    { name: 'Applicant', value: interaction.user.tag },
                    { name: 'Name', value: name },
                    { name: 'Age', value: age },
                    { name: 'Reason', value: reason }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_${interaction.user.id}`)
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_${interaction.user.id}`)
                        .setLabel('Deny')
                        .setStyle(ButtonStyle.Danger)
                );

            await reviewChannel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: 'Your application has been submitted.', ephemeral: true });
        } else if (interaction.customId === 'suggestion') {
            const suggestion = interaction.fields.getTextInputValue('suggestion_input');
            const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            const suggestionChannel = interaction.guild.channels.cache.get(config.suggestionChannelId);
            if (suggestionChannel) {
                const embed = new BrandedEmbedBuilder()
                    .setTitle('New Suggestion')
                    .setDescription(suggestion)
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
                await suggestionChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Your suggestion has been submitted.', ephemeral: true });
            }
        } else if (interaction.customId === 'bug_report') {
            const description = interaction.fields.getTextInputValue('bug_description');
            const reproduce = interaction.fields.getTextInputValue('bug_reproduce');
            const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            const bugReportChannel = interaction.guild.channels.cache.get(config.bugReportChannelId);
            if (bugReportChannel) {
                const embed = new BrandedEmbedBuilder()
                    .setTitle('New Bug Report')
                    .addFields(
                        { name: 'Description', value: description },
                        { name: 'How to Reproduce', value: reproduce }
                    )
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
                await bugReportChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Your bug report has been submitted.', ephemeral: true });
            }
        } else if (interaction.customId === 'staff_options_modal') {
            const selectedOption = interaction.values[0];

            switch (selectedOption) {
                case 'rename': {
                    const modal = new ModalBuilder()
                        .setCustomId('rename_ticket_modal')
                        .setTitle('שינוי שם הטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('new_name_input')
                                    .setLabel('שם חדש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case 'add_user': {
                    const modal = new ModalBuilder()
                        .setCustomId('add_user_modal')
                        .setTitle('הוספת משתמש לטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('user_id_input')
                                    .setLabel('ID של המשתמש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case 'remove_user': {
                    const modal = new ModalBuilder()
                        .setCustomId('remove_user_modal')
                        .setTitle('הסרת משתמש מהטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('user_id_input')
                                    .setLabel('ID של המשתמש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
            }
        } else if (interaction.customId === 'rename_ticket_modal') {
            const newName = interaction.fields.getTextInputValue('new_name_input');
            await interaction.channel.setName(newName);
            await interaction.reply({ content: 'שם הטיקט שונה!', ephemeral: true });
        } else if (interaction.customId === 'add_user_modal') {
            const userId = interaction.fields.getTextInputValue('user_id_input');
            const member = await interaction.guild.members.fetch(userId);
            await interaction.channel.permissionOverwrites.edit(member.id, { ViewChannel: true });
            await interaction.reply({ content: 'המשתמש הוסף לטיקט!', ephemeral: true });
        } else if (interaction.customId === 'remove_user_modal') {
            const userId = interaction.fields.getTextInputValue('user_id_input');
            const member = await interaction.guild.members.fetch(userId);
            await interaction.channel.permissionOverwrites.delete(member.id);
            await interaction.reply({ content: 'המשתמש הוסר מהטיקט!', ephemeral: true });
        }
    } else if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
            log(interaction.guild, `${interaction.user.tag} used command /${interaction.commandName}`, 'command');
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    } else if (interaction.isButton()) {
        const { customId } = interaction;
        const channel = interaction.channel;
        const member = interaction.member;

        if (customId.startsWith('approve_') || customId.startsWith('deny_')) {
            const [action, userId] = customId.split('_');
            const targetMember = await interaction.guild.members.fetch(userId);

            if (action === 'approve') {
                await targetMember.send('Your application has been approved! Please open a ticket to continue.');
                await interaction.reply({ content: `Application approved for ${targetMember.user.tag}.` });
            } else {
                await targetMember.send('Your application has been denied.');
                await interaction.reply({ content: `Application denied for ${targetMember.user.tag}.` });
            }
        } else if (interaction.isStringSelectMenu() && customId === 'select_ticket_category') {
            await interaction.deferReply({ ephemeral: true });
            const category = interaction.values[0];
            const guild = interaction.guild;
            const member = interaction.member;

            const channel = await guild.channels.create({
                name: `${category}-${member.user.username}`,
                type: 0, // TEXT
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: ['ViewChannel'],
                    },
                    {
                        id: member.id,
                        allow: ['ViewChannel'],
                    },
                    // Add staff roles here from config
                ],
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('לקחת את הטיקט')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('staff_options')
                        .setLabel('Staff Options')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                content: `ברוך הבא ${member}! איש צוות יהיה איתך בקרוב.`,
                components: [row]
            });

            await interaction.followUp({ content: `טיקט נוצר: ${channel}`, ephemeral: true });

        } else if (customId === 'close_ticket') {
            // Add check for staff role here
            log(interaction.guild, `Ticket ${channel.name} closed by ${member.user.tag}.`, 'ticket');
            await interaction.reply({ content: 'Closing this ticket in 5 seconds...' });
            setTimeout(() => channel.delete(), 5000);
        } else if (customId === 'staff_options') {
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_staff_option')
                        .setPlaceholder('בחר אפשרות')
                        .addOptions([
                            { label: 'שנה שם לטיקט', value: 'rename' },
                            { label: 'הוסף איש לטיקט', value: 'add_user' },
                            { label: 'הסר איש מהטיקט', value: 'remove_user' },
                        ])
                );
            await interaction.reply({ components: [row], ephemeral: true });
        } else if (interaction.isStringSelectMenu() && customId === 'select_staff_option') {
            const selectedOption = interaction.values[0];

            switch (selectedOption) {
                case 'rename': {
                    const modal = new ModalBuilder()
                        .setCustomId('rename_ticket_modal')
                        .setTitle('שינוי שם הטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('new_name_input')
                                    .setLabel('שם חדש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case 'add_user': {
                    const modal = new ModalBuilder()
                        .setCustomId('add_user_modal')
                        .setTitle('הוספת משתמש לטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('user_id_input')
                                    .setLabel('ID של המשתמש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
                case 'remove_user': {
                    const modal = new ModalBuilder()
                        .setCustomId('remove_user_modal')
                        .setTitle('הסרת משתמש מהטיקט')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                    .setCustomId('user_id_input')
                                    .setLabel('ID של המשתמש')
                                    .setStyle(TextInputStyle.Short)
                                    .setRequired(true)
                            )
                        );
                    await interaction.showModal(modal);
                    break;
                }
            }
        } else if (customId === 'claim_ticket') {
            // Add check for staff role here
            log(interaction.guild, `Ticket ${channel.name} claimed by ${member.user.tag}.`, 'ticket');
            await channel.permissionOverwrites.edit(member.id, { ViewChannel: true });
            await interaction.reply({ content: `Ticket claimed by ${member.user.tag}.` });

            // Update ticket counts
            let ticketCounts;
            try {
                ticketCounts = JSON.parse(fs.readFileSync('ticketCounts.json', 'utf8'));
            } catch {
                ticketCounts = {};
            }
            ticketCounts[member.id] = (ticketCounts[member.id] || 0) + 1;
            fs.writeFileSync('ticketCounts.json', JSON.stringify(ticketCounts));

            // Disable the claim button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('Claimed')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                );
            await interaction.message.edit({ components: [row] });
        } else if (customId === 'claim_drop') {
            await interaction.reply({ content: `Congratulations ${member}! You claimed the drop!` });

            // Disable the button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_drop')
                        .setLabel('Claimed')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true)
                );
            await interaction.message.edit({ components: [row] });
        } else if (customId.startsWith('verify_')) {
            const roleId = customId.split('_')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (role) {
                await member.roles.add(role);
                await interaction.reply({ content: 'You have been verified!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Verification role not found.', ephemeral: true });
            }
        }
    }
    } catch (error) {
        console.error(error);
        log(interaction.guild, `An error occurred: ${error.message}`, 'command');
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this interaction!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this interaction!', ephemeral: true });
        }
    }
});

client.login(process.env.BOT_TOKEN);
