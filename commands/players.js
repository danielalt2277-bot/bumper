const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { request } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('players')
        .setDescription('Shows the number of players on the FiveM server.'),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const { body } = await request('http://141.226.242.24:30120/players.json');
            const players = await body.json();

            const { body: infoBody } = await request('http://141.226.242.24:30120/info.json');
            const serverInfo = await infoBody.json();

            const maxPlayers = serverInfo.vars.sv_maxClients;


            const embed = new EmbedBuilder()
                .setTitle('FiveM Server Status')
                .addFields({ name: 'Online Players', value: `${players.length}/${maxPlayers}` })
                .setColor('Green');

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setTitle('FiveM Server Status')
                .setDescription('Could not fetch server information. The server is likely offline.')
                .setColor('Red');
            await interaction.reply({ embeds: [embed] });
        }
    },
};
