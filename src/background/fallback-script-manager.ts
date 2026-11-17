import type {UserSettings} from '../definitions';
import {getBroadMatchPatterns, getExactMatchPatterns, mayMatchHost} from '../utils/url';

import {logWarn} from './utils/log';

declare const browser: {
    scripting?: typeof chrome.scripting;
    // Firefox before version 102 has no scripting API in Manifest V2
    contentScripts?: {
        register(options: {
            js: Array<{file: string}>;
            matches: string[];
            excludeMatches: string[];
            runAt: 'document_start';
            allFrames: boolean;
            matchAboutBlank: boolean;
        }): Promise<{unregister: () => Promise<void>}>;
    };
};

export interface FallbackScriptTargets {
    matches: string[];
    excludeMatches: string[];
}

const ALL_URLS: FallbackScriptTargets = {matches: ['<all_urls>'], excludeMatches: []};
const FALLBACK_SCRIPT_ID = 'fallback';
// Firefox resolves relative paths against the background page
const FALLBACK_SCRIPT_FILE = '/inject/fallback.js';

/**
 * The fallback style darkens a page before the page knows whether it will be themed,
 * and is removed once the background answers. Pages that won't be themed shouldn't get it,
 * or they show in the fallback colors whenever they are opened in a new tab and the answer
 * arrives after the first paint. Returns null when no page should get it.
 * @param isEnabled Whether the extension is switched on.
 * @param settings User settings.
 * @param darkHosts Sites the dark theme detector found dark last time.
 */
export function getFallbackScriptTargets(
    isEnabled: boolean,
    settings: Pick<UserSettings, 'enabledByDefault' | 'enabledFor' | 'disabledFor' | 'detectDarkTheme'>,
    darkHosts: string[] = [],
): FallbackScriptTargets | null {
    if (!isEnabled) {
        return null;
    }
    if (!settings.enabledByDefault) {
        // Only sites on the "enabled for" list are themed
        if (settings.enabledFor.length === 0) {
            return null;
        }
        const matches = new Set<string>();
        for (const entry of settings.enabledFor) {
            const patterns = getBroadMatchPatterns(entry);
            if (!patterns) {
                return ALL_URLS;
            }
            patterns.forEach((pattern) => matches.add(pattern));
        }
        return {matches: Array.from(matches), excludeMatches: []};
    }
    const excludeMatches = new Set<string>();
    for (const entry of settings.disabledFor) {
        const patterns = getExactMatchPatterns(entry);
        if (!patterns) {
            continue;
        }
        const hosts = patterns.map((pattern) => pattern.substring(pattern.indexOf('://') + 3, pattern.length - 2));
        // Sites on the "enabled for" list are themed even when they are also on the "disabled for" list
        if (hosts.some((host) => settings.enabledFor.some((enabledEntry) => mayMatchHost(enabledEntry, host)))) {
            continue;
        }
        patterns.forEach((pattern) => excludeMatches.add(pattern));
    }
    if (settings.detectDarkTheme) {
        for (const host of darkHosts) {
            // The detector doesn't run on sites on the "enabled for" list
            if (settings.enabledFor.some((enabledEntry) => mayMatchHost(enabledEntry, host))) {
                continue;
            }
            getExactMatchPatterns(`^${host}`)?.forEach((pattern) => excludeMatches.add(pattern));
        }
    }
    return {matches: ALL_URLS.matches, excludeMatches: Array.from(excludeMatches)};
}

// Firefox only: the fallback script is registered at runtime instead of in the manifest,
// so that it can skip the pages that won't be themed.
export default class FallbackScriptManager {
    private static queue: Promise<void> = Promise.resolve();
    private static lastTargetsKey: string | null = null;
    private static legacyRegistration: {unregister: () => Promise<void>} | null = null;

    static update(targets: FallbackScriptTargets | null): void {
        const key = JSON.stringify(targets);
        if (key === FallbackScriptManager.lastTargetsKey) {
            return;
        }
        FallbackScriptManager.lastTargetsKey = key;
        FallbackScriptManager.queue = FallbackScriptManager.queue.then(async () => {
            try {
                await FallbackScriptManager.register(targets);
            } catch (err) {
                logWarn('Could not register the fallback script', targets, err);
                FallbackScriptManager.lastTargetsKey = null;
                if (targets) {
                    // Pages that won't be themed still drop the fallback once the background answers
                    try {
                        await FallbackScriptManager.register(ALL_URLS);
                    } catch (err2) {
                        logWarn('Could not register the fallback script', ALL_URLS, err2);
                    }
                }
            }
        });
    }

    private static async register(targets: FallbackScriptTargets | null) {
        if (browser.scripting?.registerContentScripts) {
            const registered = await browser.scripting.getRegisteredContentScripts({ids: [FALLBACK_SCRIPT_ID]});
            if (!targets) {
                if (registered.length > 0) {
                    await browser.scripting.unregisterContentScripts({ids: [FALLBACK_SCRIPT_ID]});
                }
                return;
            }
            const script: chrome.scripting.RegisteredContentScript = {
                id: FALLBACK_SCRIPT_ID,
                js: [FALLBACK_SCRIPT_FILE],
                matches: targets.matches,
                excludeMatches: targets.excludeMatches,
                runAt: 'document_start',
                allFrames: true,
                matchOriginAsFallback: true,
                world: 'MAIN',
                persistAcrossSessions: true,
            };
            if (registered.length > 0) {
                await browser.scripting.updateContentScripts([script]);
            } else {
                await browser.scripting.registerContentScripts([script]);
            }
            return;
        }

        // These registrations don't persist, so pages loaded before
        // the background page starts won't get the fallback
        if (FallbackScriptManager.legacyRegistration) {
            await FallbackScriptManager.legacyRegistration.unregister();
            FallbackScriptManager.legacyRegistration = null;
        }
        if (targets && browser.contentScripts) {
            FallbackScriptManager.legacyRegistration = await browser.contentScripts.register({
                js: [{file: FALLBACK_SCRIPT_FILE}],
                matches: targets.matches,
                excludeMatches: targets.excludeMatches,
                runAt: 'document_start',
                allFrames: true,
                matchAboutBlank: true,
            });
        }
    }
}
