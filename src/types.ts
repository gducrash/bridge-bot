export type BridgeMessageMedia = {
    type: 'photo'|'video'|'audio'|'document',
    url: string,
}

export type BridgeMessage = {
    source: 'discord'|'telegram',
    portal: string,
    discordId: string|null,
    telegramId: string|null,
    content: string,
    discordReplyTo?: string,
    telegramReplyTo?: string,
    author: {
        id: string,
        name: string,
        avatar?: string,
    }
    attachments: {
        voice?: string,
        media?: BridgeMessageMedia[],
    }
}

export type AudioMeta = {
    waveform: string,
    duration: number,
}