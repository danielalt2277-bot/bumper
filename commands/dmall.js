const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionsBitField, InteractionResponseFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dmall')
        .setDescription('Sends a direct message to all members of the server.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const message = interaction.options.getString('message');

        try {
            const members = await interaction.guild.members.fetch();
            members.forEach(member => {
                if (!member.user.bot) {
                    member.send(message).catch(console.error);
                }
            });

            await interaction.reply({ content: 'Message sent to all members.', flags: InteractionResponseFlags.Ephemeral });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error sending the message.', flags: InteractionResponseFlags.Ephemeral });
        }
    },
};
