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

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('ULTIMATE RP', { type: 'PLAYING' });
});

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const hangmanGames = new Map();
const userMessages = new Map();

const staffRoleId = '11432039573764046858';

let logChannelId;

try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    logChannelId = config.logChannelId;
} catch {
    console.log('config.json not found or is empty. Use /setlogchannel to set the log channel.');
}

const log = (guild, message) => {
    if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId);
        if (logChannel) {
            const embed = new EmbedBuilder()
                .setDescription(message)
                .setTimestamp();
            logChannel.send({ embeds: [embed] });
        }
    }
    console.log(message);
};

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
    if (linkRegex.test(message.content) && !message.member.roles.cache.has(staffRoleId)) {
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

            const embed = new EmbedBuilder()
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
                const embed = new EmbedBuilder()
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
                const embed = new EmbedBuilder()
                    .setTitle('New Bug Report')
                    .addFields(
                        { name: 'Description', value: description },
                        { name: 'How to Reproduce', value: reproduce }
                    )
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });
                await bugReportChannel.send({ embeds: [embed] });
                await interaction.reply({ content: 'Your bug report has been submitted.', ephemeral: true });
            }
        }
    } else if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
            log(interaction.guild, `${interaction.user.tag} used command /${interaction.commandName}`);
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
        } else if (customId === 'close_ticket') {
            // Add check for staff role here
            log(`Ticket ${channel.name} closed by ${member.user.tag}.`);
            await interaction.reply({ content: 'Closing this ticket in 5 seconds...' });
            setTimeout(() => channel.delete(), 5000);
        } else if (customId === 'claim_ticket') {
            // Add check for staff role here
            log(interaction.guild, `Ticket ${channel.name} claimed by ${member.user.tag}.`);
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
});

client.login(process.env.BOT_TOKEN);
