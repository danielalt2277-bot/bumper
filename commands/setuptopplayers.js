const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuptopplayers')
        .setDescription('Sets up the live-updating top players panel.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the panel in.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        const embed = new EmbedBuilder()
            .setTitle('Top 10 Players')
            .setDescription('Fetching data...');

        const message = await channel.send({ embeds: [embed] });

        let config;
        try {
            config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        } catch {
            config = {};
        }

        config.topPlayersPanel = {
            channelId: channel.id,
            messageId: message.id
        };

        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));

        await interaction.reply({ content: 'Top players panel setup complete!', ephemeral: true });
    },
};
