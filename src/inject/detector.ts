import type {DetectorHint} from '../definitions';
import {getSRGBLightness, parseColorWithCache} from '../utils/color';
import {isSystemDarkModeEnabled} from '../utils/media-query';

const COLOR_SCHEME_META_SELECTOR = 'meta[name="color-scheme"]';

function hasBuiltInDarkTheme() {
    const rootStyle = getComputedStyle(document.documentElement);
    if (rootStyle.filter.includes('invert(1)') || rootStyle.colorScheme === 'dark') {
        return true;
    }

    const CELL_SIZE = 256;
    const MAX_ROW_COUNT = 4;
    const winWidth = innerWidth;
    const winHeight = innerHeight;
    const stepX = Math.floor(winWidth / Math.min(MAX_ROW_COUNT, Math.ceil(winWidth / CELL_SIZE)));
    const stepY = Math.floor(winHeight / Math.min(MAX_ROW_COUNT, Math.ceil(winHeight / CELL_SIZE)));

    const processedElements = new Set<Element>();

    for (let y = Math.floor(stepY / 2); y < winHeight; y += stepY) {
        for (let x = Math.floor(stepX / 2); x < winWidth; x += stepX) {
            const element = document.elementFromPoint(x, y);
            if (!element || processedElements.has(element) || element.tagName.toLocaleLowerCase() === 'img') {
                continue;
            }
            processedElements.add(element);
            const style = element === document.documentElement ? rootStyle : getComputedStyle(element);
            const bgColor = parseColorWithCache(style.backgroundColor);
            if (!bgColor) {
                return false;
            }
            if (bgColor.r === 24 && bgColor.g === 26 && bgColor.b === 27) {
                // For some websites changes to CSSStyleSheet.disabled and HTMLStyleElement.textContent
                // are not being applied synchronously. For example https://zorin.com/
                // Probably a browser bug. Treat as not having a dark theme.
                return false;
            }
            if (bgColor.a === 1) {
                const bgLightness = getSRGBLightness(bgColor.r, bgColor.g, bgColor.b);
                if (bgLightness > 0.6) {
                    return false;
                }
            } else {
                const textColor = parseColorWithCache(style.color);
                if (!textColor) {
                    return false;
                }
                const textLightness = getSRGBLightness(textColor.r, textColor.g, textColor.b);
                if (textLightness < 0.4) {
                    return false;
                }
            }
        }
    }

    const rootColor = parseColorWithCache(rootStyle.backgroundColor);
    if (!rootColor) {
        return false;
    }

    const bodyColor = document.body ? parseColorWithCache(getComputedStyle(document.body).backgroundColor) : {r: 0, g: 0, b: 0, a: 0};
    if (!bodyColor) {
        return false;
    }

    if (rootColor.a === 0 && bodyColor.a === 0) {
        const rootTextColor = parseColorWithCache(rootStyle.color);
        if (rootTextColor) {
            const textLightness = getSRGBLightness(rootTextColor.r, rootTextColor.g, rootTextColor.b);
            return textLightness > 0.5;
        }
    }

    const rootLightness = (1 - rootColor.a!) + rootColor.a! * getSRGBLightness(rootColor.r, rootColor.g, rootColor.b);
    const finalLightness = (1 - bodyColor.a!) * rootLightness + bodyColor.a! * getSRGBLightness(bodyColor.r, bodyColor.g, bodyColor.b);

    return finalLightness < 0.5;
}

// Signals in the markup itself. Reading them never makes the browser lay out the page,
// so they are checked as soon as the detector starts and whenever the document changes.
function getMarkupVerdict(): boolean | null {
    const colorSchemeMeta = document.querySelector<HTMLMetaElement>(COLOR_SCHEME_META_SELECTOR);
    if (colorSchemeMeta) {
        const content = colorSchemeMeta.content.toLocaleLowerCase();
        if (content === 'dark' || content === 'only dark') {
            return true;
        }
        if (content === 'light' || content === 'only light') {
            return false;
        }
    }
    if (
        document.documentElement.classList.contains('dark') ||
        document.body?.classList.contains('dark') ||
        document.documentElement.dataset.theme?.toLocaleLowerCase() === 'dark'
    ) {
        return true;
    }
    return null;
}

function checkRenderedPage(): boolean {
    const drSheets = Array.from(document.styleSheets).filter((s) => (s.ownerNode as HTMLElement)?.classList.contains('darkreader'))
        .concat(
            Array.isArray(document.adoptedStyleSheets) ? Array.from(document.adoptedStyleSheets).filter(
                (s) => (s.cssRules?.[0] as CSSStyleRule)?.selectorText?.startsWith('#__darkreader')
            ) : [],
        );
    drSheets.forEach((sheet) => sheet.disabled = true);

    const darkThemeDetected = hasBuiltInDarkTheme();

    drSheets.forEach((sheet) => sheet.disabled = false);
    return darkThemeDetected;
}

function hasSomeStyle() {
    if (document.querySelector(COLOR_SCHEME_META_SELECTOR) != null) {
        return true;
    }
    if (document.documentElement.style.backgroundColor || (document.body && document.body.style.backgroundColor)) {
        return true;
    }
    for (const style of document.styleSheets) {
        if (style && style.ownerNode && !((style.ownerNode as HTMLElement).classList && (style.ownerNode as HTMLElement).classList.contains('darkreader'))) {
            return true;
        }
    }
    return false;
}

// Reads layout, so it must only run once the page's stylesheets are in, see DetectorSession.canPaint()
function hasContent() {
    const body = document.body;
    if (!body || body.childElementCount === 0 || !hasSomeStyle()) {
        return false;
    }
    let hasVisibleChild = false;
    for (const child of body.children) {
        if (child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE' && child.tagName !== 'LINK') {
            hasVisibleChild = true;
            break;
        }
    }
    return hasVisibleChild && body.scrollHeight >= 32 && body.clientHeight >= 32;
}

const STYLESHEET_SELECTOR = 'link[rel~="stylesheet" i]';
// Stylesheets that never report back stop being waited for after this long
const STYLESHEET_WAIT_LIMIT = 3000;

function isStyleSheetLoading(link: HTMLLinkElement) {
    if (!link.sheet) {
        return true;
    }
    try {
        return !link.sheet.cssRules;
    } catch (err) {
        // Cross-origin sheets throw once loaded too, only a "loading" error means pending
        return Boolean((err as Error)?.message?.includes('loading'));
    }
}

type DetectorCallback = (hasDarkTheme: boolean) => void;

/**
 * Finds out whether the page has a dark theme of its own without making the browser
 * lay out the page before its stylesheets are in. Doing that makes Firefox paint the page
 * unstyled, and the check then judges the unstyled page.
 *
 * Markup signals and detector hints are checked right away, since they only read attributes.
 * The rendered page is only sampled once the stylesheets that hold back the first paint
 * have loaded, in an animation frame, where the browser lays out the page anyway.
 *
 * The callback is called once, except for sites with a detector hint: those are reported
 * as light once the page can be painted, and as dark if the hint matches later,
 * since such sites often switch themes from scripts.
 */
class DetectorSession {
    private readonly callback: DetectorCallback;
    private readonly hint: DetectorHint | null;
    private readonly startTime = Date.now();
    private reported: boolean | null = null;
    private stopped = false;
    private waitingForPaint = true;
    private blockingLinks: HTMLLinkElement[] | null = null;
    private readonly settledLinks = new WeakSet<Element>();
    private readonly documentObserver: MutationObserver;
    private observesRoot = false;
    private observedHead: Element | null = null;
    private observedBody: Element | null = null;
    private observesSubtree = false;
    private hintTarget: Element | null = null;
    private hintObserver: MutationObserver | null = null;
    private frameId = 0;
    private timeoutId = 0;

    constructor(callback: DetectorCallback, hint: DetectorHint | null) {
        this.callback = callback;
        this.hint = hint;
        this.documentObserver = new MutationObserver(this.check);
    }

    start() {
        // load and error events do not bubble, so listen in the capture phase
        document.addEventListener('load', this.onResourceSettled, true);
        document.addEventListener('error', this.onResourceSettled, true);
        document.addEventListener('readystatechange', this.check);
        this.timeoutId = setTimeout(this.check, STYLESHEET_WAIT_LIMIT + 1);
        this.check();
    }

    stop() {
        this.stopped = true;
        this.stopWaitingForPaint();
        this.documentObserver.disconnect();
        this.hintObserver?.disconnect();
        this.hintObserver = null;
    }

    private stopWaitingForPaint() {
        this.waitingForPaint = false;
        document.removeEventListener('load', this.onResourceSettled, true);
        document.removeEventListener('error', this.onResourceSettled, true);
        document.removeEventListener('readystatechange', this.check);
        clearTimeout(this.timeoutId);
        cancelAnimationFrame(this.frameId);
        this.frameId = 0;
    }

    private report(hasDarkTheme: boolean) {
        if (this.reported === hasDarkTheme) {
            return;
        }
        this.reported = hasDarkTheme;
        this.callback(hasDarkTheme);
    }

    private onResourceSettled = (e: Event) => {
        if (e.target instanceof HTMLLinkElement) {
            this.settledLinks.add(e.target);
            this.check();
        }
    };

    private check = () => {
        if (this.stopped) {
            return;
        }
        this.observeDocument();
        if (this.hint) {
            this.checkHint(this.hint);
        } else {
            this.checkGeneric();
        }
    };

    private observeDocument() {
        const root = document.documentElement;
        // A hint target may be anywhere, so the whole document is watched until it shows up
        const needsSubtree = Boolean(this.hint && !this.hintTarget);
        if (!this.observesRoot || needsSubtree !== this.observesSubtree) {
            this.observesRoot = true;
            this.observesSubtree = needsSubtree;
            this.documentObserver.observe(root, {
                childList: true,
                subtree: needsSubtree,
                attributes: true,
                attributeFilter: ['class', 'data-theme'],
            });
        }
        if (document.head && document.head !== this.observedHead) {
            this.observedHead = document.head;
            this.documentObserver.observe(document.head, {childList: true});
        }
        if (document.body && document.body !== this.observedBody) {
            this.observedBody = document.body;
            this.documentObserver.observe(document.body, {childList: true, attributes: true, attributeFilter: ['class']});
        }
    }

    // Whether the stylesheets that hold back the first paint have loaded
    private canPaint(): boolean {
        if (document.readyState === 'complete' || Date.now() - this.startTime >= STYLESHEET_WAIT_LIMIT) {
            return true;
        }
        if (!this.blockingLinks) {
            if (!document.body) {
                return false;
            }
            // Stylesheets parsed before <body> hold back the first paint.
            // Ones that scripts add later don't, so they are not waited for.
            this.blockingLinks = Array.from(document.head?.querySelectorAll<HTMLLinkElement>(STYLESHEET_SELECTOR) ?? []);
        }
        return !this.blockingLinks.some((link) => this.isPending(link));
    }

    private isPending(link: HTMLLinkElement) {
        return (
            !this.settledLinks.has(link) &&
            link.isConnected &&
            // Links without an address never load. GitHub has 14 of them for themes it loads on demand.
            Boolean(link.getAttribute('href')) &&
            !link.disabled &&
            !link.relList.contains('alternate') &&
            !link.classList.contains('darkreader') &&
            (!link.media || matchMedia(link.media).matches) &&
            isStyleSheetLoading(link)
        );
    }

    private checkGeneric() {
        const verdict = getMarkupVerdict();
        if (verdict !== null) {
            this.stop();
            this.report(verdict);
            return;
        }
        if (document.readyState === 'complete') {
            this.stop();
            this.report(checkRenderedPage());
            return;
        }
        if (this.canPaint()) {
            this.scheduleRenderedCheck();
        }
    }

    private scheduleRenderedCheck() {
        if (this.frameId) {
            return;
        }
        this.frameId = requestAnimationFrame(() => {
            this.frameId = 0;
            if (this.stopped) {
                return;
            }
            const verdict = getMarkupVerdict();
            if (verdict !== null || hasContent()) {
                this.stop();
                this.report(verdict ?? checkRenderedPage());
                return;
            }
            // Not enough content to judge yet
            this.scheduleRenderedCheck();
        });
    }

    private findHintTarget(hint: DetectorHint) {
        if (!this.hintTarget || !this.hintTarget.isConnected) {
            this.hintTarget = document.querySelector(hint.target);
            this.hintObserver?.disconnect();
            this.hintObserver = null;
            if (this.hintTarget) {
                this.hintObserver = new MutationObserver(this.check);
                this.hintObserver.observe(this.hintTarget, {attributes: true});
                this.observeDocument();
            }
        }
        return this.hintTarget;
    }

    private checkHint(hint: DetectorHint) {
        const target = this.findHintTarget(hint);
        if (target) {
            const selectors = (hint.match || []).concat(
                (isSystemDarkModeEnabled() ? hint.matchSystemDark : hint.matchSystemLight) || [],
            );
            if (selectors.length > 0 && target.matches(selectors.join(', '))) {
                this.stop();
                this.report(true);
                return;
            }
        }
        if (this.waitingForPaint && this.canPaint() && (target || document.readyState !== 'loading')) {
            // Keep watching the target, the page may still switch to its dark theme
            this.stopWaitingForPaint();
            this.report(false);
        }
    }
}

let session: DetectorSession | null = null;

export function runDarkThemeDetector(callback: DetectorCallback, hints: DetectorHint[] | null): void {
    stopDarkThemeDetector();
    const hint = hints && hints.length > 0 ? hints[0] : null;
    if (hint) {
        if (hint.noDarkTheme) {
            callback(false);
            return;
        }
        if (hint.systemTheme && isSystemDarkModeEnabled()) {
            callback(true);
            return;
        }
        if (!hint.target) {
            callback(false);
            return;
        }
    }
    session = new DetectorSession(callback, hint);
    session.start();
}

export function stopDarkThemeDetector(): void {
    session?.stop();
    session = null;
}
