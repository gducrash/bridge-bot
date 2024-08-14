import { BridgeMessage } from "./types";
import * as discord from './discord';
import * as telegram from './telegram';
import { MESSAGE_LOG_CAPACITY } from "./settings";

export const telegramUserWebhookMap: Map<string, string> = new Map();
export const messageLog: BridgeMessage[] = [];

export async function registerMessageCreate (message: BridgeMessage) {

    messageLog.push(message);
    if (messageLog.length > MESSAGE_LOG_CAPACITY) {
        while (messageLog.length > MESSAGE_LOG_CAPACITY)
            messageLog.shift();
    }

    if (message.source === 'discord') {

        // add opposite platform replyTo id, if exists
        const replyToTarget = messageLog.find(f => f.discordId === message.discordReplyTo);
        if (message.discordReplyTo && replyToTarget)
            message.telegramReplyTo = replyToTarget.telegramId;

        // copy message to telegram, update it's telegram id
        const telegramId = await telegram.postMessage(message);
        message.telegramId = telegramId;

    } else if (message.source === 'telegram') {

        // add opposite platform replyTo id, if exists
        const replyToTarget = messageLog.find(f => f.telegramId === message.telegramReplyTo);
        if (message.telegramReplyTo && replyToTarget)
            message.discordReplyTo = replyToTarget.discordId;

        // get or create user webhook
        const webhook = await getWebhook(message);

        // copy message to discord, update it's discord id
        const discordId = await discord.postMessage(message, webhook);
        message.discordId = discordId;

    }

} 

export async function registerMessageDelete (source: 'discord'|'telegram', id: string) {

    let message: BridgeMessage;

    if (source == 'discord') message = messageLog.find(m => m.discordId == id);
    if (source == 'telegram') message = messageLog.find(m => m.telegramId == id);
    if (!message) return;

    if (source == 'discord') await telegram.deleteMessage(message);
    if (source == 'telegram') await discord.deleteMessage(message);

}

export async function registerMessageEdit (source: 'discord'|'telegram', id: string, content: string) {
    
    let message: BridgeMessage;

    if (source == 'discord') message = messageLog.find(m => m.discordId == id);
    if (source == 'telegram') message = messageLog.find(m => m.telegramId == id);
    if (!message) return;

    message.content = content;

    if (source == 'discord') 
        await telegram.editMessage(message);
    if (source == 'telegram') {
        const webhook = await getWebhook(message);
        await discord.editMessage(message, webhook);
    }

}

export function updateTelegramUserWebhook (portal: string, author: string, webhookId: string) {
    const key = portal + '/' + author;
    telegramUserWebhookMap.set(key, webhookId);
}

export async function getWebhook (message: BridgeMessage) {
    const key = message.portal + '/' + message.author.id;
    if (!telegramUserWebhookMap.has(key))
        telegramUserWebhookMap.set(key, await discord.createWebhook(message));
    const webhook = telegramUserWebhookMap.get(key);
    return webhook;
}