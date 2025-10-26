const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Creates a new ticket channel.'),
    async execute(interaction) {
        const guild = interaction.guild;
        const member = interaction.member;

        try {
            const channel = await guild.channels.create({
                name: `ticket-${member.user.username}`,
                type: 0, // TEXT
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    },
                    // Add staff roles here
                ],
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel('Claim Ticket')
                        .setStyle(ButtonStyle.Success)
                );

            await channel.send({
                content: `Welcome ${member}! A staff member will be with you shortly.`,
                components: [row]
            });

            await interaction.reply({ content: `Ticket channel created: ${channel}`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error creating the ticket channel.', ephemeral: true });
        }
    },
};
