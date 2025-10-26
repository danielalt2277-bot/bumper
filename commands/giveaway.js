const { SlashCommandBuilder } = require('@discordjs/builders');
const BrandedEmbedBuilder = require('../utils/embedBuilder');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Starts a giveaway.')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('The duration of the giveaway (e.g., 1m, 1h, 1d).')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('prize')
                .setDescription('The prize of the giveaway.')
                .setRequired(true)),
    async execute(interaction) {
        const duration = interaction.options.getString('duration');
        const prize = interaction.options.getString('prize');
        const durationMs = ms(duration);

        if (!durationMs) {
            return interaction.reply({ content: 'Invalid duration format.', ephemeral: true });
        }

        const embed = new BrandedEmbedBuilder()
            .setTitle('🎉 Giveaway! 🎉')
            .setDescription(`React with 🎉 to enter!\n**Prize:** ${prize}`)
            .setFooter({ text: `Ends in ${duration}` })
            .setTimestamp(Date.now() + durationMs);

        const giveawayMessage = await interaction.channel.send({ embeds: [embed] });
        giveawayMessage.react('🎉');

        setTimeout(async () => {
            const reactions = giveawayMessage.reactions.cache.get('🎉');
            const users = await reactions.users.fetch();
            const winner = users.filter(user => !user.bot).random();

            if (winner) {
                await interaction.channel.send(`Congratulations ${winner}! You won the **${prize}**!`);
            } else {
                await interaction.channel.send('No one entered the giveaway.');
            }
        }, durationMs);

        await interaction.reply({ content: 'Giveaway started!', ephemeral: true });
    },
};
