const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketsetup')
        .setDescription('Sets up the ticket creation message.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the ticket creation message in.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        const embed = new EmbedBuilder()
            .setTitle('Create a Ticket')
            .setDescription('Click the button below to open a support ticket.')
            .setColor('Blue');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Ticket setup message sent!', ephemeral: true });
    },
};
