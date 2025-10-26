const { SlashCommandBuilder } = require('@discordjs/builders');

const words = ['discord', 'hangman', 'bot', 'javascript', 'fivem'];

const games = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Starts a game of Hangman.'),
    async execute(interaction) {
        const word = words[Math.floor(Math.random() * words.length)];
        const guessedLetters = new Set();
        let incorrectGuesses = 0;
        const maxIncorrectGuesses = 6;

        games.set(interaction.channel.id, {
            word,
            guessedLetters,
            incorrectGuesses,
            maxIncorrectGuesses,
            originalInteraction: interaction
        });

        await interaction.reply({ content: `A new game of Hangman has started! The word has ${word.length} letters. Guess a letter by sending it in this channel.` });

        // This is a simplified version. I'll add the message collector and win/loss logic in index.js
    },
};
