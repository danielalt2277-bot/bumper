const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, InteractionResponseFlags } = require('discord.js');
const BrandedEmbedBuilder = require('../utils/embedBuilder');

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

        const embed = new BrandedEmbedBuilder()
            .setTitle('פתיחת טיקט')
            .setDescription('בחר את הקטגוריה המתאימה לפתיחת טיקט חדש.')
            .setColor('Blue');

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_ticket_category')
                    .setPlaceholder('בחר קטגוריה')
                    .addOptions([
                        { label: 'קנייה', value: 'buy', emoji: '💸' },
                        { label: 'שאלה', value: 'question', emoji: '❓' },
                        { label: 'תלונה על צוות', value: 'staff_complaint', emoji: '🚫' },
                        { label: 'תלונה על שחקן', value: 'player_complaint', emoji: '⚠️' },
                        { label: 'באג בשרת', value: 'bug_report', emoji: '🕹️' },
                        { label: 'פתיחת גאנג', value: 'gang_application', emoji: '🕵️‍♂️' },
                        { label: 'הורדת באן', value: 'unban_request', emoji: '🔒' },
                        { label: 'בחינה', value: 'exam', emoji: '🌟' },
                    ]),
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Ticket setup message sent!', flags: InteractionResponseFlags.Ephemeral });
    },
};
