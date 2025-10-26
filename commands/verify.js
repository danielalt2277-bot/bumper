const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Sends a verification message.')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give to verified users.')
                .setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole('role');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`verify_${role.id}`)
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.channel.send({
            content: 'Click the button to verify yourself!',
            components: [row]
        });

        await interaction.reply({ content: 'Verification message sent!', ephemeral: true });
    },
};
