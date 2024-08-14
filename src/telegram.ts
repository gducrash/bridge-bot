import { Context, Telegraf } from 'telegraf';
import { BridgeMessage, BridgeMessageMedia } from './types';
import { Message, User } from 'telegraf/typings/core/types/typegram';
import { TELEGRAM_CHAT_ID } from './settings';
import { discordMdToTelegramHtml, escapeHtml, telegramToDiscord } from './helpers';
import { registerMessageCreate, registerMessageDelete, registerMessageEdit } from './bridge';
import { ExtraReplyMessage, MediaGroup } from 'telegraf/typings/telegram-types';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const startDate = new Date();

bot.on('message', async ctx => {
    // ignore messages, sent earlier than the bot start time
    if (ctx.message.date * 1000 < +startDate) return;

    // get telegram topic id, and the corresponding discord portal
    const telegramTopic = ctx.message.is_topic_message ? ctx.message.message_thread_id?.toString() : undefined;
    const discordPortal = telegramToDiscord(telegramTopic);
    if (discordPortal === undefined) return;

    // check if message is reply
    const telegramReplyTo = (ctx.message as any).reply_to_message.message_id?.toString();

    // check for attachments (voice, video notes, stickers, videos, photos, audios, documents)

    const umsg = ctx.update.message as any;
    let voiceUrl: string|undefined;
    let mediaUrls: BridgeMessageMedia[]|undefined;

    if (umsg.voice) {
        voiceUrl = (await bot.telegram.getFileLink(umsg.voice.file_id)).href;
    }
    if (umsg.video_note) {
        mediaUrls = [{
            type: 'video',
            url: (await bot.telegram.getFileLink(umsg.video_note.file_id)).href,
        }];
    }
    if (umsg.sticker) {
        mediaUrls = [{
            type: 'photo',
            url: (await bot.telegram.getFileLink(umsg.sticker.file_id)).href,
        }];
    }

    let mediaType: 'video'|'photo'|'audio'|'document';
    let mediaObj;
    if (umsg.video) {
        mediaType = 'video';
        mediaObj = umsg.video;
    }
    if (umsg.photo) {
        mediaType = 'photo';
        mediaObj = umsg.photo;
    }
    if (umsg.audio) {
        mediaType = 'audio';
        mediaObj = umsg.audio;
    }
    if (umsg.document) {
        mediaType = 'document';
        mediaObj = umsg.document;
    }

    if (mediaObj)
        mediaUrls = [{
            type: mediaType,
            url: (await bot.telegram.getFileLink(Array.isArray(mediaObj) 
                ? mediaObj.at(-1).file_id 
                : mediaObj.file_id
            )).href,
        }];

    // construct bridge message
    const message: BridgeMessage = {
        source: 'telegram',
        portal: discordPortal,
        discordId: null,
        telegramId: ctx.message.message_id?.toString(),
        content: ctx.text ?? umsg.caption,
        telegramReplyTo: telegramReplyTo == telegramTopic 
            ? undefined 
            : telegramReplyTo,
        author: {
            id: ctx.message.from.id?.toString(),
            name: getUserName(ctx.message.from),
            avatar: await getUserAvatar(ctx, ctx.message.from),
        },
        attachments: {
            voice: voiceUrl,
            media: mediaUrls,
        }
    }

    registerMessageCreate(message);
});


bot.on('edited_message', async ctx => {
    registerMessageEdit('telegram', ctx.msgId.toString(), ctx.text ?? (ctx.message as any)?.caption);
});

export async function postMessage (message: BridgeMessage) {
    // construct hybrid text messages to send
    const text = `<b>${escapeHtml(message.author.name)}</b>: ${discordMdToTelegramHtml(message.content)}`;
    const captionText = `${message.author.name}:`;
    let newMsg: Message;

    // for replies and topics
    const extra = {
        message_thread_id: Number(message.portal),
        reply_to_message_id: message.telegramReplyTo && Number(message.telegramReplyTo),
        parse_mode: 'HTML',
    } as ExtraReplyMessage;

    // for media and voice messages
    if (message.attachments.voice) {
        newMsg = await bot.telegram.sendVoice(TELEGRAM_CHAT_ID, message.attachments.voice, { ...extra, caption: captionText });
    } else if (message.attachments.media) {
        const mediaGroup: MediaGroup = message.attachments.media.map(a => ({
            media: a.url,
            type: a.type as any,
        }));
        mediaGroup[0].caption = text;
        newMsg = (await bot.telegram.sendMediaGroup(TELEGRAM_CHAT_ID, mediaGroup, extra))[0];
    }
    
    // for text messages
    else {
        newMsg = await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, text, extra)
    }

    return newMsg?.message_id?.toString();
}

export async function deleteMessage (message: BridgeMessage) {
    await bot.telegram.deleteMessage(TELEGRAM_CHAT_ID, Number(message.telegramId));
}

export async function editMessage (message: BridgeMessage) {
    const text = `${message.author.name}: ${message.content}`;

    if (message.attachments.voice || message.attachments.media)
        await bot.telegram.editMessageCaption(TELEGRAM_CHAT_ID, Number(message.telegramId), undefined, text);
    else
        await bot.telegram.editMessageText(TELEGRAM_CHAT_ID, Number(message.telegramId), undefined, text);
}

async function getUserAvatar (ctx: Context, user: User) {
    const photos = await ctx.telegram.getUserProfilePhotos(user.id, 0, 1);
    if (photos.total_count > 0) {
        const fileId = photos.photos[0][0].file_id;
        const fileUrl = await ctx.telegram.getFileLink(fileId);
        return fileUrl.href;
    } else {
        return undefined;
    }
}

function getUserName (user: User) {
    return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
}

export async function init () {
    await bot.launch();
    console.log("Telegram client ready");
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));