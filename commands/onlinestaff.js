const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { request } = require('undici');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Shows online staff members on the FiveM server.')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The staff role to check for.')
                .setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole('role');

        try {
            const { body } = await request('http://1.1.1.1:30120/players.json');
            const players = await body.json();

            const staffMembers = players.filter(player => {
                const member = interaction.guild.members.cache.find(m => m.id === player.identifiers.find(id => id.startsWith('discord:')).substring(8));
                return member && member.roles.cache.has(role.id);
            });

            const embed = new EmbedBuilder()
                .setTitle('Online Staff')
                .setDescription(staffMembers.map(staff => staff.name).join('\n') || 'No staff members online.');

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Could not fetch player information.', ephemeral: true });
        }
    },
};
