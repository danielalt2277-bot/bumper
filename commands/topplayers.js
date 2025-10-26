const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { request } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topplayers')
        .setDescription('Shows the top 10 players on the FiveM server.'),
    async execute(interaction) {
        try {
            const { body } = await request('http://141.226.242.24:30120/players.json');
            const players = await body.json();

            const sortedPlayers = players.sort((a, b) => a.id - b.id).slice(0, 10);

            const embed = new EmbedBuilder()
                .setTitle('Top 10 Players')
                .setDescription(sortedPlayers.map((player, index) => `${index + 1}. ${player.name} (ID: ${player.id})`).join('\n') || 'No players online.');

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Could not fetch player information.', ephemeral: true });
        }
    },
};
