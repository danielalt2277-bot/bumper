const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { request } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverstatus')
        .setDescription('Shows the FiveM server status.'),
    async execute(interaction) {
        try {
            const { body: playerBody } = await request('http://141.226.242.24:30120/players.json');
            const players = await playerBody.json();

            const { body: infoBody } = await request('http://141.226.242.24:30120/info.json');
            const serverInfo = await infoBody.json();

            const maxPlayers = serverInfo.vars.sv_maxClients;

            const embed = new EmbedBuilder()
                .setTitle('FiveM Server Status')
                .addFields(
                    { name: 'Status', value: 'Online', inline: true },
                    { name: 'Players', value: `${players.length}/${maxPlayers}`, inline: true }
                )
                .setColor('Green')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setTitle('FiveM Server Status')
                .addFields({ name: 'Status', value: 'Offline' })
                .setColor('Red')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
    },
};
