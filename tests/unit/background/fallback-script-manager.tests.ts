import {getFallbackScriptTargets} from '../../../src/background/fallback-script-manager';

describe('Fallback script targets', () => {
    const settings = {enabledByDefault: true, enabledFor: [] as string[], disabledFor: [] as string[], detectDarkTheme: true};

    test('No fallback when the extension is off', () => {
        expect(getFallbackScriptTargets(false, settings)).toEqual(null);
    });

    test('All sites by default', () => {
        expect(getFallbackScriptTargets(true, settings)).toEqual({matches: ['<all_urls>'], excludeMatches: []});
    });

    test('Skips disabled sites', () => {
        expect(getFallbackScriptTargets(true, {...settings, disabledFor: ['github.com', 'google.*', 'example.com/page', '^ya.ru']})).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: ['*://github.com/*', '*://www.github.com/*', '*://ya.ru/*'],
        });
    });

    test('Keeps disabled sites that are also enabled', () => {
        expect(getFallbackScriptTargets(true, {...settings, disabledFor: ['github.com', 'gitlab.com'], enabledFor: ['github.com/darkreader']})).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: ['*://gitlab.com/*', '*://www.gitlab.com/*'],
        });
        expect(getFallbackScriptTargets(true, {...settings, disabledFor: ['github.com'], enabledFor: ['/git/']})).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: [],
        });
    });

    test('Skips sites the detector found dark', () => {
        expect(getFallbackScriptTargets(true, settings, ['github.com', 'www.example.com', 'localhost'])).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: ['*://github.com/*', '*://www.example.com/*'],
        });
        expect(getFallbackScriptTargets(true, {...settings, disabledFor: ['github.com']}, ['github.com'])).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: ['*://github.com/*', '*://www.github.com/*'],
        });
        // The detector doesn't run on these
        expect(getFallbackScriptTargets(true, {...settings, enabledFor: ['github.com']}, ['github.com'])).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: [],
        });
        expect(getFallbackScriptTargets(true, {...settings, detectDarkTheme: false}, ['github.com'])).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: [],
        });
        expect(getFallbackScriptTargets(true, {...settings, enabledByDefault: false, enabledFor: ['example.com']}, ['github.com'])).toEqual({
            matches: ['*://example.com/*', '*://www.example.com/*'],
            excludeMatches: [],
        });
    });

    test('Only enabled sites when not enabled by default', () => {
        expect(getFallbackScriptTargets(true, {...settings, enabledByDefault: false})).toEqual(null);
        expect(getFallbackScriptTargets(true, {...settings, enabledByDefault: false, enabledFor: ['github.com', '*.example.com', 'github.com/x']})).toEqual({
            matches: ['*://github.com/*', '*://www.github.com/*', '*://*.example.com/*'],
            excludeMatches: [],
        });
        expect(getFallbackScriptTargets(true, {...settings, enabledByDefault: false, enabledFor: ['github.com', 'google.*']})).toEqual({
            matches: ['<all_urls>'],
            excludeMatches: [],
        });
    });
});
