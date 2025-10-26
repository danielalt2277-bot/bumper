const { EmbedBuilder } = require('discord.js');

const thumbnailUrl = 'https://images-ext-1.discordapp.net/external/MA2wshJnnVDT0uY5qlPUIgIomt2EaPoGQ3dhfF1gGYU/%3Fsize%3D512/https/cdn.discordapp.com/avatars/1159088261973692446/a_173ff96494cc90965091ac90999815a9.gif';

class BrandedEmbedBuilder extends EmbedBuilder {
    constructor() {
        super();
        this.setThumbnail(thumbnailUrl);
    }
}

module.exports = BrandedEmbedBuilder;
