const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, InteractionResponseFlags } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbugreportchannel')
        .setDescription('Sets the channel for bug reports.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to use for bug reports.')
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

        config.bugReportChannelId = channel.id;
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));

        await interaction.reply({ content: `Bug report channel set to ${channel}.`, flags: InteractionResponseFlags.Ephemeral });
    },
};
