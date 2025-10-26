const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const BrandedEmbedBuilder = require('../utils/embedBuilder');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupticketleaderboard')
        .setDescription('Sets up the live-updating ticket leaderboard.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the leaderboard in.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        const embed = new BrandedEmbedBuilder()
            .setTitle('Ticket Leaderboard')
            .setDescription('Fetching data...');

        const message = await channel.send({ embeds: [embed] });

        let config;
        try {
            config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        } catch {
            config = {};
        }

        config.ticketLeaderboard = {
            channelId: channel.id,
            messageId: message.id
        };

        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));

        await interaction.reply({ content: 'Ticket leaderboard setup complete!', ephemeral: true });
    },
};
