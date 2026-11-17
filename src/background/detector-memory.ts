import type {DetectorVerdict} from '../definitions';

import {readLocalStorage, writeLocalStorage} from './utils/extension-api';

interface StoredVerdict extends DetectorVerdict {
    time: number;
}

const STORAGE_KEY = 'detectorVerdicts';
// The sites seen longest ago are forgotten beyond this many
const MAX_SITES = 500;
const SAVE_DELAY = 1000;
// How often an unchanged verdict gets a fresh timestamp, which keeps the site from being forgotten
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

function getHost(url: string): string | null {
    try {
        const {protocol, hostname} = new URL(url);
        if (protocol !== 'https:' && protocol !== 'http:') {
            return null;
        }
        return hostname || null;
    } catch (err) {
        return null;
    }
}

/**
 * Remembers what the dark theme detector found on each site. On the next visit, a site that was dark
 * gets neither the fallback colors nor a theme that would be thrown away, and a site that was light
 * gets its theme without waiting for the detector.
 */
export default class DetectorMemory {
    private static verdicts: Record<string, StoredVerdict> = {};
    private static loading: Promise<void> | null = null;
    private static saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    static load(): Promise<void> {
        if (!DetectorMemory.loading) {
            DetectorMemory.loading = readLocalStorage({[STORAGE_KEY]: {} as Record<string, StoredVerdict>}).then((local) => {
                DetectorMemory.verdicts = {...local[STORAGE_KEY], ...DetectorMemory.verdicts};
            });
        }
        return DetectorMemory.loading;
    }

    static get(url: string): DetectorVerdict | null {
        const host = getHost(url);
        const stored = host ? DetectorMemory.verdicts[host] : null;
        return stored ? {isDark: stored.isDark, isSystemDark: stored.isSystemDark} : null;
    }

    /**
     * @returns Whether the remembered verdict changed.
     */
    static set(url: string, verdict: DetectorVerdict): boolean {
        const host = getHost(url);
        if (!host) {
            return false;
        }
        const old = DetectorMemory.verdicts[host];
        const changed = !old || old.isDark !== verdict.isDark || old.isSystemDark !== verdict.isSystemDark;
        if (changed || Date.now() - old.time > REFRESH_INTERVAL) {
            DetectorMemory.verdicts[host] = {isDark: verdict.isDark, isSystemDark: verdict.isSystemDark, time: Date.now()};
            DetectorMemory.forgetOldest();
            DetectorMemory.scheduleSave();
        }
        return changed;
    }

    // Sites that were dark while the system color scheme was dark, the only time the fallback colors are used
    static getDarkHosts(): string[] {
        return Object.entries(DetectorMemory.verdicts)
            .filter(([, stored]) => stored.isDark && stored.isSystemDark)
            .map(([host]) => host);
    }

    private static forgetOldest() {
        const hosts = Object.keys(DetectorMemory.verdicts);
        if (hosts.length <= MAX_SITES) {
            return;
        }
        hosts
            .sort((a, b) => DetectorMemory.verdicts[a].time - DetectorMemory.verdicts[b].time)
            .slice(0, hosts.length - MAX_SITES)
            .forEach((host) => delete DetectorMemory.verdicts[host]);
    }

    private static scheduleSave() {
        if (DetectorMemory.saveTimeoutId) {
            return;
        }
        DetectorMemory.saveTimeoutId = setTimeout(() => {
            DetectorMemory.saveTimeoutId = null;
            writeLocalStorage({[STORAGE_KEY]: DetectorMemory.verdicts});
        }, SAVE_DELAY);
    }
}
