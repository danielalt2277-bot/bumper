const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetleaderboard')
        .setDescription('Resets the ticket claim leaderboard.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        fs.writeFileSync('ticketCounts.json', JSON.stringify({}));
        await interaction.reply({ content: 'Ticket leaderboard has been reset.', ephemeral: true });
    },
};
