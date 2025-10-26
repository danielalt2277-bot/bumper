const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Sets the channel for bot logs.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to use for logging.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        // Store the channel ID. For now, we'll use a simple JSON file.
        const config = { logChannelId: channel.id };
        fs.writeFileSync('config.json', JSON.stringify(config));

        await interaction.reply({ content: `Log channel set to ${channel}.`, ephemeral: true });
    },
};
