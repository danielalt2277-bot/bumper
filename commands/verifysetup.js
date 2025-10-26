const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, InteractionResponseFlags } = require('discord.js');
const BrandedEmbedBuilder = require('../utils/embedBuilder');

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

        const embed = new BrandedEmbedBuilder()
            .setTitle('אימות')
            .setDescription('על מנת לקבל גישה לשרת, יש ללחוץ על הכפתור למטה.')
            .setColor('Green');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`verify_${role.id}`)
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Verification message sent!', flags: InteractionResponseFlags.Ephemeral });
    },
};
