import { DISCORD_PORTALS, TELEGRAM_PORTALS } from "./settings";
import { AudioMeta } from "./types";
import { AudioContext } from 'node-web-audio-api';

const EMPTY_META: AudioMeta = {
    waveform: "AAAAAAAAAAAA",
    duration: 1,
};

export function discordToTelegram (discordPortalId: string) {
    const targetPortal = DISCORD_PORTALS.indexOf(discordPortalId);
    return TELEGRAM_PORTALS[targetPortal];
}

export function telegramToDiscord (telegramPortalId: string) {
    const targetPortal = TELEGRAM_PORTALS.indexOf(telegramPortalId);
    return DISCORD_PORTALS[targetPortal];
}

export const clamp = (val, min, max) => Math.min(Math.max(val, min), max)

export async function getAudioMeta (blob: Blob): Promise<AudioMeta> {
    if (!blob) return EMPTY_META;

    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const channelData = audioBuffer.getChannelData(0);

    // average the samples into much lower resolution bins, maximum of 256 total bins
    const bins = new Uint8Array(clamp(Math.floor(audioBuffer.duration * 10), Math.min(32, channelData.length), 256));
    const samplesPerBin = Math.floor(channelData.length / bins.length);

    // Get root mean square of each bin
    for (let binIdx = 0; binIdx < bins.length; binIdx++) {
        let squares = 0;
        for (let sampleOffset = 0; sampleOffset < samplesPerBin; sampleOffset++) {
            const sampleIdx = binIdx * samplesPerBin + sampleOffset;
            squares += channelData[sampleIdx] ** 2;
        }
        bins[binIdx] = ~~(Math.sqrt(squares / samplesPerBin) * 0xFF);
    }

    // Normalize bins with easing
    const maxBin = Math.max(...bins);
    const ratio = 1 + (0xFF / maxBin - 1) * Math.min(1, 100 * (maxBin / 0xFF) ** 3);
    for (let i = 0; i < bins.length; i++) bins[i] = Math.min(0xFF, ~~(bins[i] * ratio));

    return {
        waveform: Buffer.from(String.fromCharCode(...bins)).toString('base64'),
        duration: audioBuffer.duration,
    };
}

export function convertContentType (contentType: string) {
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('image/')) return 'photo';
    if (contentType.startsWith('audio/')) return 'audio';
    return 'document';
}