const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop')
        .setDescription('Creates a drop.')
        .addStringOption(option =>
            option.setName('prize')
                .setDescription('The prize of the drop.')
                .setRequired(true)),
    async execute(interaction) {
        const prize = interaction.options.getString('prize');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_drop')
                    .setLabel('Claim')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.channel.send({
            content: `A drop has appeared! Click the button to claim the **${prize}**!`,
            components: [row]
        });

        await interaction.reply({ content: 'Drop created!', ephemeral: true });
    },
};
