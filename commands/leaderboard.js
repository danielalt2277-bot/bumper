const { SlashCommandBuilder } = require('@discordjs/builders');
const BrandedEmbedBuilder = require('../utils/embedBuilder');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Displays the ticket claim leaderboard.'),
    async execute(interaction) {
        let ticketCounts;
        try {
            ticketCounts = JSON.parse(fs.readFileSync('ticketCounts.json', 'utf8'));
        } catch {
            ticketCounts = {};
        }

        const sortedUsers = Object.entries(ticketCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        const embed = new BrandedEmbedBuilder()
            .setTitle('Ticket Leaderboard')
            .setDescription(sortedUsers.map(([userId, count], index) => `${index + 1}. <@${userId}>: ${count} tickets`).join('\n') || 'No tickets claimed yet.');

        await interaction.reply({ embeds: [embed] });
    },
};
