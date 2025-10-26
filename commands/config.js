const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Sets up the bot configuration.')
        .addRoleOption(option => option.setName('staff_role').setDescription('The role for staff members.').setRequired(true))
        .addChannelOption(option => option.setName('ticket_logs').setDescription('The channel for ticket logs.').setRequired(true))
        .addChannelOption(option => option.setName('command_logs').setDescription('The channel for command usage logs.').setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const staffRole = interaction.options.getRole('staff_role');
        const ticketLogs = interaction.options.getChannel('ticket_logs');
        const commandLogs = interaction.options.getChannel('command_logs');

        const config = {
            staffRoleId: staffRole.id,
            logChannels: {
                ticket: ticketLogs.id,
                command: commandLogs.id
            }
        };

        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));

        await interaction.reply({ content: 'Configuration saved!', ephemeral: true });
    },
};
