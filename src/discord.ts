import * as dotenv from 'dotenv';
dotenv.config();

import { Client, Events, GatewayIntentBits, Message, TextChannel, Webhook } from 'discord.js';
import { discordToTelegram } from './helpers';
import { BridgeMessage, BridgeMessageMedia } from './types';
import { registerMessageCreate, registerMessageDelete, registerMessageEdit, updateTelegramUserWebhook } from './bridge';
import { convertContentType, getAudioMeta } from './helpers';

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });


bot.once(Events.ClientReady, async readyClient => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

bot.on(Events.MessageCreate, msg => {
    // if self, or bot/wh, skip
    if (msg.author.id === bot.user.id || msg.author.bot) return;

    // get discord channel id, and the corresponding telegram portal
    const discordChannel = msg.channelId;
    const telegramPortal = discordToTelegram(discordChannel);
    if (telegramPortal === undefined) return;

    // check for voice and media attachments
    const voiceUrl = msg.attachments.find(a => a.waveform)?.url;
    const mediaUrls: BridgeMessageMedia[] = msg.attachments.size ? msg.attachments?.map(a => ({
        type: convertContentType(a.contentType),
        url: a.url,
    })) : undefined;

    // construct bridge message
    const message: BridgeMessage = {
        source: 'discord',
        portal: telegramPortal,
        discordId: msg.id,
        telegramId: null,
        content: msg.content,
        discordReplyTo: msg.reference?.messageId,
        author: {
            id: msg.author.id,
            name: msg.author.displayName,
        },
        attachments: {
            voice: voiceUrl,
            media: mediaUrls,
        }
    }

    registerMessageCreate(message);

});

bot.on(Events.MessageDelete, msg => {
    // if self, or bot/wh, skip
    if (msg.author.id === bot.user.id || msg.author.bot) return;

    registerMessageDelete('discord', msg.id);
});

bot.on(Events.MessageUpdate, (_, newMsg) => {
    // if self, or bot/wh, skip
    if (newMsg.author.id === bot.user.id || newMsg.author.bot) return;
    
    registerMessageEdit('discord', newMsg.id, newMsg.content);
});


export async function postMessage (message: BridgeMessage, webhookId?: string) {
    let newMsg: Message;

    const channel = await bot.channels.fetch(message.portal) as TextChannel;

    // for webhook sends (preferred)
    if (webhookId) {

        // get target webhook
        const text = message.content;
        const webhook = await fetchWebhookById(message, webhookId);

        // for replies
        if (message.discordReplyTo) {
            const msg = await channel.messages.fetch(message.discordReplyTo);
            if (msg)
                await msg.reply('Re:')
        }

        // for media and voice messages
        let additionalPayload = {};
        if (message.attachments.voice) 
            additionalPayload = await attachVoiceMessage(message);
        else if (message.attachments.media) {
            additionalPayload = await attachMedia(message);
        }

        newMsg = await webhook.send({ content: text, ...additionalPayload });

    // for bot sends
    } else {
 
        const text = `${message.author.name}: ${message.content}`;

        if (message.discordReplyTo) {
            const msg = await channel.messages.fetch(message.discordReplyTo);
            if (msg)
                newMsg = await msg.reply(text)
            else
                newMsg = await channel.send(text)
        } else
            newMsg = await channel.send(text);

    }

    return newMsg?.id;
}

export async function deleteMessage (message: BridgeMessage) {
    const channel = await bot.channels.fetch(message.portal) as TextChannel;
    await channel.messages.delete(message.discordId)
}

export async function editMessage (message: BridgeMessage, webhookId: string) {
    const webhook = await fetchWebhookById(message, webhookId);

    await webhook.editMessage(message.discordId, {
        content: message.content,
    });
}



export async function createWebhook (message: BridgeMessage) {
    const channel = await bot.channels.fetch(message.portal) as TextChannel;

    // delete all previous webhooks in the channel, if the count is > 10
    channel.fetchWebhooks().then(oldWhs => {
        if (oldWhs.size <= 10) return;
        oldWhs.forEach(oldWh => {
            oldWh.delete();
        }) ;
    });

    const wh = await channel.createWebhook({
        name: message.author.name,
        avatar: message.author.avatar,
    });
    return wh.id;
}

export async function init () {
    await bot.login(process.env.DISCORD_BOT_TOKEN);
}


async function attachVoiceMessage (message: BridgeMessage) {
    //const blob = new Blob([buf]);
    //const { waveform, duration } = await getAudioMeta(blob);

    return {
        files: [{
            attachment: message.attachments.voice,
            name: 'voice-message.ogg',
            contentType: 'audio/ogg; codecs=opus',
            waveform: 'AAAAAAAAAAAA',
            duration: 2,
        }],
        flags: 1 << 13,
    };   

}

async function attachMedia (message: BridgeMessage) {
    return {
        files: message.attachments.media.map(a => ({
            attachment: a.url,
        })),
    };   
}

async function fetchWebhookById (message: BridgeMessage, webhookId: string) {
    let webhook: Webhook;
    try {
        webhook = await bot.fetchWebhook(webhookId).catch(() => {}) as any;
    } catch {}

    if (!webhook) {
        const newWebhookId = await createWebhook(message);
        webhook = await bot.fetchWebhook(newWebhookId);
        updateTelegramUserWebhook(message.portal, message.author.id, newWebhookId);
    }
    webhook.name = message.author.name;
    webhook.avatar = message.author.avatar;
    return webhook;
}


process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});