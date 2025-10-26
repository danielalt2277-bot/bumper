const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, InteractionResponseFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Makes the bot say a message.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to say.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const message = interaction.options.getString('message');
        await interaction.channel.send(message);
        await interaction.reply({ content: 'Message sent.', flags: InteractionResponseFlags.Ephemeral });
    },
};
