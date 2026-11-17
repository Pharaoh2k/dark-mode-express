import type {UserSettings, TabInfo} from '../definitions';

import {cachedFactory} from './cache';

declare const __THUNDERBIRD__: boolean;

let anchor: HTMLAnchorElement;

export const parsedURLCache = new Map<string, URL>();

function fixBaseURL($url: string): string {
    if (!anchor) {
        anchor = document.createElement('a');
    }
    anchor.href = $url;
    return anchor.href;
}

export function parseURL($url: string, $base: string | null = null): URL {
    const key = `${$url}${$base ? `;${$base}` : ''}`;
    if (parsedURLCache.has(key)) {
        return parsedURLCache.get(key)!;
    }
    if ($base) {
        const parsedURL = new URL($url, fixBaseURL($base));
        parsedURLCache.set(key, parsedURL);
        return parsedURL;
    }
    const parsedURL = new URL(fixBaseURL($url));
    parsedURLCache.set($url, parsedURL);
    return parsedURL;
}

export function getAbsoluteURL($base: string, $relative: string): string {
    if ($relative.match(/^data\\?\:/)) {
        return $relative;
    }
    // Check if relative starts with `//hostname...`.
    // We have to add a protocol to make it absolute.
    if (/^\/\//.test($relative)) {
        return `${location.protocol}${$relative}`;
    }
    const b = parseURL($base);
    const a = parseURL($relative, b.href);
    return a.href;
}

// Check if any relative URL is on the window.location;
// So that https://duck.com/ext.css would return true on https://duck.com/
// But https://duck.com/styles/ext.css would return false on https://duck.com/
// Visa versa https://duck.com/ext.css should return fasle on https://duck.com/search/
// We're checking if any relative value within ext.css could potentially not be on the same path.
export function isRelativeHrefOnAbsolutePath(href: string): boolean {
    if (href.startsWith('data:')) {
        return true;
    }
    const url = parseURL(href);

    if (url.protocol !== location.protocol) {
        return false;
    }
    if (url.hostname !== location.hostname) {
        return false;
    }
    if (url.port !== location.port) {
        return false;
    }
    // Now check if the path is on the same path as the base
    // We do this by getting the pathname up until the last slash.
    return url.pathname === location.pathname;
}

export function getURLHostOrProtocol($url: string): string {
    const url = new URL($url);
    if (url.host) {
        return url.host;
    } else if (url.protocol === 'file:') {
        return url.pathname;
    }
    return url.protocol;
}

export function compareURLPatterns(a: string, b: string): number {
    return a.localeCompare(b);
}

/**
 * Determines whether URL has a match in URL template list.
 * @param url Site URL.
 * @paramlist List to search into.
 */
export function isURLInList(url: string, list: string[]): boolean {
    for (let i = 0; i < list.length; i++) {
        if (isURLMatched(url, list[i])) {
            return true;
        }
    }
    return false;
}

/**
 * Determines whether URL matches the template.
 * @param url URL.
 * @param urlTemplate URL template ("google.*", "youtube.com" etc).
 */
export function isURLMatched(url: string, urlTemplate: string): boolean {
    if (isRegExp(urlTemplate)) {
        const regexp = createRegExp(urlTemplate);
        return regexp ? regexp.test(url) : false;
    }
    return matchURLPattern(url, urlTemplate);
}

// Site list entries can be turned into match patterns for registering content scripts.
// Match patterns can't express everything an entry can (regular expressions,
// wildcards inside a host, path segments, "www." being optional), so there is a
// conversion that covers exactly the URLs an entry matches, when one exists,
// and a conversion that covers at least those URLs.

const MATCH_PATTERN_HOST_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

interface SiteListEntryParts {
    scheme: string;
    host: string;
    path: string;
    hasPort: boolean;
    exactStart: boolean;
    exactEnd: boolean;
}

function parseSiteListEntry(entry: string): SiteListEntryParts | null {
    if (isRegExp(entry)) {
        return null;
    }
    let rest = entry;
    const exactStart = rest.startsWith('^');
    if (exactStart) {
        rest = rest.substring(1);
    }
    const exactEnd = rest.endsWith('$');
    if (exactEnd) {
        rest = rest.substring(0, rest.length - 1);
    }
    let scheme = '*';
    const protocolIndex = rest.indexOf('://');
    if (protocolIndex > 0) {
        scheme = rest.substring(0, protocolIndex);
        rest = rest.substring(protocolIndex + 3);
        if (scheme !== 'http' && scheme !== 'https') {
            return null;
        }
    }
    const slashIndex = rest.indexOf('/');
    const path = slashIndex < 0 ? '' : rest.substring(slashIndex + 1);
    let host = slashIndex < 0 ? rest : rest.substring(0, slashIndex);
    const portIndex = host.lastIndexOf(':');
    const hasPort = portIndex >= 0;
    if (hasPort) {
        host = host.substring(0, portIndex);
    }
    return {scheme, host, path, hasPort, exactStart, exactEnd};
}

/**
 * Returns match patterns that match exactly the URLs the site list entry matches,
 * or null when no such patterns exist.
 * @param entry Site list entry ("example.com", "https://example.com" etc).
 */
export function getExactMatchPatterns(entry: string): string[] | null {
    const parts = parseSiteListEntry(entry);
    if (
        !parts ||
        parts.path ||
        parts.hasPort ||
        parts.exactEnd ||
        !parts.host.includes('.') ||
        !MATCH_PATTERN_HOST_REGEX.test(parts.host)
    ) {
        return null;
    }
    const {scheme, host, exactStart} = parts;
    const patterns = [`${scheme}://${host}/*`];
    if (!exactStart) {
        patterns.push(`${scheme}://www.${host}/*`);
    }
    return patterns;
}

/**
 * Returns match patterns that match at least the URLs the site list entry matches,
 * or null when no such patterns exist.
 * @param entry Site list entry ("example.com", "*.example.com" etc).
 */
export function getBroadMatchPatterns(entry: string): string[] | null {
    const parts = parseSiteListEntry(entry);
    if (!parts) {
        return null;
    }
    const {scheme, exactStart} = parts;
    let host = parts.host.toLowerCase();
    const isAnySubdomain = host.startsWith('*.');
    if (isAnySubdomain) {
        host = host.substring(2);
    }
    if (!MATCH_PATTERN_HOST_REGEX.test(host)) {
        return null;
    }
    // A template with a single host part like "localhost" matches its subdomains too
    if (isAnySubdomain || !host.includes('.')) {
        return [`${scheme}://*.${host}/*`];
    }
    const patterns = [`${scheme}://${host}/*`];
    if (!exactStart) {
        patterns.push(`${scheme}://www.${host}/*`);
    }
    return patterns;
}

/**
 * Determines whether the site list entry may match some URL on the host,
 * with any protocol, port or path.
 * @param entry Site list entry.
 * @param host Host name.
 */
export function mayMatchHost(entry: string, host: string): boolean {
    if (isRegExp(entry)) {
        // Can't tell which URLs a regular expression matches
        return true;
    }
    const parts = parseSiteListEntry(entry);
    if (!parts) {
        // Protocols other than HTTP and HTTPS
        return false;
    }
    return isURLMatched(`https://${host}/`, `${parts.exactStart ? '^' : ''}${parts.host}`);
}

interface PreparedURL {
    hostParts: string[];
    pathParts: string[];
    port: string;
    protocol: string;
}

interface PreparedPattern {
    hostParts: string[];
    pathParts: string[];
    port: string;
    protocol: string;
    exactStart: boolean;
    exactEnd: boolean;
}

const URL_CACHE_SIZE = 32;
const prepareURL = cachedFactory((url: string): PreparedURL | null => {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch (err) {
        return null;
    }
    const {hostname, pathname, protocol, port} = parsed;
    const hostParts = hostname.split('.').reverse();
    const pathParts = pathname.split('/').slice(1);
    if (!pathParts[pathParts.length - 1]) {
        pathParts.splice(pathParts.length - 1, 1);
    }
    return {
        hostParts,
        pathParts,
        port,
        protocol,
    };
}, URL_CACHE_SIZE);

const URL_MATCH_CACHE_SIZE = 32 * 1024;
const preparePattern = cachedFactory((pattern: string): PreparedPattern | null => {
    if (!pattern) {
        return null;
    }

    const exactStart = pattern.startsWith('^');
    const exactEnd = pattern.endsWith('$');
    if (exactStart) {
        pattern = pattern.substring(1);
    }
    if (exactEnd) {
        pattern = pattern.substring(0, pattern.length - 1);
    }

    let protocol = '';
    const protocolIndex = pattern.indexOf('://');
    if (protocolIndex > 0) {
        protocol = pattern.substring(0, protocolIndex + 1);
        pattern = pattern.substring(protocolIndex + 3);
    }

    const slashIndex = pattern.indexOf('/');
    const host = slashIndex < 0 ? pattern : pattern.substring(0, slashIndex);

    let hostName = host;

    let isIPv6 = false;
    let ipV6End = -1;
    if (host.startsWith('[')) {
        ipV6End = host.indexOf(']');
        if (ipV6End > 0) {
            isIPv6 = true;
        }
    }

    let port = '*';
    const portIndex = host.lastIndexOf(':');
    if (portIndex >= 0 && (!isIPv6 || ipV6End < portIndex)) {
        hostName = host.substring(0, portIndex);
        port = host.substring(portIndex + 1);
    }

    if (isIPv6) {
        try {
            const ipV6URL = new URL(`http://${hostName}`);
            hostName = ipV6URL.hostname;
        } catch (err) {
        }
    }

    const hostParts = hostName.split('.').reverse();

    const path = slashIndex < 0 ? '' : pattern.substring(slashIndex + 1);
    const pathParts = path.split('/');
    if (!pathParts[pathParts.length - 1]) {
        pathParts.splice(pathParts.length - 1, 1);
    }

    return {
        hostParts,
        pathParts,
        port,
        exactStart,
        exactEnd,
        protocol,
    };
}, URL_MATCH_CACHE_SIZE);

function matchURLPattern(url: string, pattern: string) {
    const u = prepareURL(url);
    const p = preparePattern(pattern);
    return matchPreparedURLPattern(u, p);
}

function matchPreparedURLPattern(u: PreparedURL | null, p: PreparedPattern | null) {
    if (
        !(u && p)
        || (p.hostParts.length > u.hostParts.length)
        || (p.exactStart && p.hostParts.length !== u.hostParts.length)
        || (p.exactEnd && p.pathParts.length !== u.pathParts.length)
        || (p.port !== '*' && p.port !== u.port)
        || (p.protocol && p.protocol !== u.protocol)
    ) {
        return false;
    }

    for (let i = 0; i < p.hostParts.length; i++) {
        const pHostPart = p.hostParts[i];
        const uHostPart = u.hostParts[i];
        if (pHostPart !== '*' && pHostPart !== uHostPart) {
            return false;
        }
    }

    if (
        p.hostParts.length >= 2
        && p.hostParts.at(-1) !== '*'
        && (
            p.hostParts.length < u.hostParts.length - 1
            || (
                p.hostParts.length === u.hostParts.length - 1
                && u.hostParts.at(-1) !== 'www'
            )
        )
    ) {
        return false;
    }

    if (p.pathParts.length === 0) {
        return true;
    }

    if (p.pathParts.length > u.pathParts.length) {
        return false;
    }

    for (let i = 0; i < p.pathParts.length; i++) {
        const pPathPart = p.pathParts[i];
        const uPathPart = u.pathParts[i];
        if (pPathPart !== '*' && pPathPart !== uPathPart) {
            return false;
        }
    }

    return true;
}

function isRegExp(pattern: string) {
    return pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2;
}

const REGEXP_CACHE_SIZE = 1024;
const createRegExp = cachedFactory((pattern: string) => {
    if (pattern.startsWith('/')) {
        pattern = pattern.substring(1);
    }
    if (pattern.endsWith('/')) {
        pattern = pattern.substring(0, pattern.length - 1);
    }
    try {
        return new RegExp(pattern);
    } catch (err) {
        return null;
    }
}, REGEXP_CACHE_SIZE);

const wikiPDFPathRegexp = /^\/.*\/[a-z]+\:[^\:\/]+\.pdf/i;

export function isPDF(url: string): boolean {
    try {
        const {hostname, pathname} = new URL(url);
        if (pathname.includes('.pdf')) {
            if (
                ((hostname.endsWith('.wikimedia.org') || hostname.endsWith('.wikipedia.org')) && pathname.match(wikiPDFPathRegexp)) ||
                (hostname.endsWith('.dropbox.com') && pathname.startsWith('/s/') && (pathname.endsWith('.pdf') || pathname.endsWith('.PDF')))
            ) {
                return false;
            }
            if (pathname.endsWith('.pdf')) {
                for (let i = pathname.length; i >= 0; i--) {
                    if (pathname[i] === '=') {
                        return false;
                    } else if (pathname[i] === '/') {
                        return true;
                    }
                }
            } else {
                return false;
            }
        }
    } catch (e) {
        // Do nothing
    }
    return false;
}

const indexedSiteLists = new WeakMap<string[], URLTemplateIndex>();

function isInListOptimized(url: string, list: string[]) {
    if (!url || list.length === 0) {
        return false;
    }
    let index = indexedSiteLists.get(list);
    if (!index) {
        index = indexURLTemplateList(list);
        indexedSiteLists.set(list, index);
    }
    return isURLInIndexedList(url, index);
}

export function isURLEnabled(url: string, userSettings: UserSettings, {isProtected, isInDarkList, isDarkThemeDetected}: Partial<TabInfo>, isAllowedFileSchemeAccess = true): boolean {
    if (isLocalFile(url) && !isAllowedFileSchemeAccess) {
        return false;
    }
    if (isProtected && !userSettings.enableForProtectedPages) {
        return false;
    }
    // Only URL's with emails are getting here on thunderbird
    // So we can skip the checks and just return true.
    if (__THUNDERBIRD__) {
        return true;
    }
    if (isPDF(url)) {
        return userSettings.enableForPDF;
    }
    const isURLInDisabledList = isInListOptimized(url, userSettings.disabledFor);
    const isURLInEnabledList = isInListOptimized(url, userSettings.enabledFor);

    if (!userSettings.enabledByDefault) {
        return isURLInEnabledList;
    }
    if (isURLInEnabledList) {
        return true;
    }
    if (isInDarkList || (userSettings.detectDarkTheme && isDarkThemeDetected)) {
        return false;
    }
    return !isURLInDisabledList;
}

export function isLocalFile(url: string): boolean {
    return Boolean(url) && url.startsWith('file:///');
}

interface URLTrieNode<T = any> {
    key: string;
    hostNodes: Map<string, URLTrieNode<T>>;
    pathNodes: Map<string, URLTrieNode<T>>;
    data: T | null;
}

export interface URLTrie<T = any> extends URLTrieNode<T> {
    hardPatterns: Array<{pattern: PreparedPattern; data: T}>;
    regexps: Array<{regexp: RegExp; data: T}>;
}

export type URLTemplateIndex = URLTrie<boolean>;

export function indexURLTemplateList<T = boolean>(list: string[], assign: ((pattern: string, index: number) => T) = () => true as T): URLTrie<T> {
    const trie: URLTrie<T> = {
        key: '',
        hostNodes: new Map(),
        pathNodes: new Map(),
        hardPatterns: [],
        regexps: [],
        data: null,
    };

    const templateIndices = new Map<PreparedPattern | RegExp, number>();

    const patterns: PreparedPattern[] = [];
    list.forEach((u, i) => {
        if (isRegExp(u)) {
            const r = createRegExp(u);
            if (r) {
                trie.regexps.push({regexp: r, data: assign(list[i], i)});
            }
        } else {
            const p = preparePattern(u);
            if (p) {
                if (p.exactStart || p.exactEnd || (p.port && p.port !== '*') || p.protocol) {
                    trie.hardPatterns.push({pattern: p, data: assign(list[i], i)});
                    return;
                }
                patterns.push(p);
                templateIndices.set(p, i);
            }
        }
    });

    patterns.forEach((pattern) => {
        const listIndex = templateIndices.get(pattern)!;
        const data = assign(list[listIndex], listIndex);

        let node: URLTrieNode = trie;
        pattern.hostParts.forEach((p) => {
            const nodes = node.hostNodes;
            if (nodes.has(p)) {
                node = nodes.get(p)!;
            } else {
                node = {
                    key: p,
                    hostNodes: new Map(),
                    pathNodes: new Map(),
                    data: null,
                };
                nodes.set(p, node);
            }
        });
        let lastHostNode = node.hostNodes.get('');
        if (!lastHostNode) {
            lastHostNode = {
                key: '',
                hostNodes: new Map(),
                pathNodes: new Map(),
                data: null,
            };
            node.hostNodes.set('', lastHostNode);
        }
        node = lastHostNode;

        if (pattern.pathParts.length === 0) {
            node.data = data;
            return;
        }

        pattern.pathParts.forEach((p) => {
            const nodes = node.pathNodes;
            if (nodes.has(p)) {
                node = nodes.get(p)!;
            } else {
                node = {
                    key: p,
                    hostNodes: new Map(),
                    pathNodes: new Map(),
                    data: null,
                };
                nodes.set(p, node);
            }
        });
        let lastPathNode = node.pathNodes.get('');
        if (!lastPathNode) {
            lastPathNode = {
                key: '',
                hostNodes: new Map(),
                pathNodes: new Map(),
                data: null,
            };
            node.pathNodes.set('', lastPathNode);
        }
        lastPathNode.data = data;
    });
    return trie;
}

export function isURLInIndexedList(url: string, trie: URLTrie<any>) {
    const matches = getURLMatchesFromIndexedList(url, trie, true);
    return matches.length > 0;
}

export function getURLMatchesFromIndexedList<T>(url: string, trie: URLTrie<T>, breakOnFirstMatch = false): T[] {
    const found = new Set<T>();
    const matches: T[] = [];

    const push = (data: T) => {
        if (!found.has(data)) {
            found.add(data);
            matches.push(data);
        }
    };

    for (const r of trie.regexps) {
        if (r.regexp.test(url)) {
            push(r.data);
            if (breakOnFirstMatch) {
                return matches;
            }
        }
    }

    const u = prepareURL(url);
    if (!u) {
        return matches;
    }

    for (const p of trie.hardPatterns) {
        if (matchPreparedURLPattern(u, p.pattern)) {
            push(p.data);
            if (breakOnFirstMatch) {
                return matches;
            }
        }
    }

    const matchHost = (node: URLTrieNode, index: number) => {
        const finalHostNode = node.hostNodes.get('');
        const noMoreHostParts = index === u.hostParts.length;
        const value = noMoreHostParts ? '' : u.hostParts[index];

        if (
            finalHostNode && (
                noMoreHostParts ||
                node.key === '*' ||
                (index === u.hostParts.length - 1 && value === 'www')
            )
        ) {
            if (finalHostNode.data) {
                push(finalHostNode.data);
                if (breakOnFirstMatch) {
                    return;
                }
            }
            matchPath(finalHostNode, 0);
        }

        if (noMoreHostParts) {
            return;
        }

        const nodes = node.hostNodes;
        const wildcardNode = nodes.get('*');
        if (wildcardNode) {
            matchHost(wildcardNode, index + 1);
        }

        if (breakOnFirstMatch && matches.length > 0) {
            return;
        }

        const keyNode = nodes.get(value);
        if (keyNode) {
            matchHost(keyNode, index + 1);
        }
    };

    const matchPath = (node: URLTrieNode, index: number) => {
        const finalPathNode = node.pathNodes.get('');
        const noMorePathParts = index === u.pathParts.length;
        const value = noMorePathParts ? '' : u.pathParts[index];

        if (finalPathNode && finalPathNode.data) {
            push(finalPathNode.data);
        }

        if (noMorePathParts) {
            return;
        }

        const nodes = node.pathNodes;
        const wildcardNode = nodes.get('*');
        if (wildcardNode) {
            matchPath(wildcardNode, index + 1);
        }

        if (breakOnFirstMatch && matches.length > 0) {
            return;
        }

        const keyNode = nodes.get(value);
        if (keyNode) {
            matchPath(keyNode, index + 1);
        }
    };

    matchHost(trie, 0);

    return matches;
}
