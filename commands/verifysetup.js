const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verifysetup')
        .setDescription('Sets up the verification message.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the verification message in.')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give to verified users.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');

        const embed = new EmbedBuilder()
            .setTitle('Verification')
            .setDescription('Click the button below to verify yourself and gain access to the server.')
            .setColor('Green');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`verify_${role.id}`)
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Verification message sent!', ephemeral: true });
    },
};
