const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setsuggestionchannel')
        .setDescription('Sets the channel for suggestions.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to use for suggestions.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        let config;
        try {
            config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        } catch {
            config = {};
        }

        config.suggestionChannelId = channel.id;
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));

        await interaction.reply({ content: `Suggestion channel set to ${channel}.`, ephemeral: true });
    },
};
