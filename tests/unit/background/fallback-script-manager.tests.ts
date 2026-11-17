import {getFallbackScriptTargets} from '../../../src/background/fallback-script-manager';

describe('Fallback script targets', () => {
    const settings = {enabledByDefault: true, enabledFor: [] as string[], disabledFor: [] as string[]};

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
