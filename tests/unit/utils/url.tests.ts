import {getBroadMatchPatterns, getExactMatchPatterns, indexURLTemplateList, isPDF, isURLInIndexedList, isURLMatched, mayMatchHost} from '../../../src/utils/url';

describe('Domain utilities', () => {
    test('URL match', () => {
        expect(isURLMatched('https://www.example.com/', '*')).toEqual(true);
        expect(isURLMatched('https://www.example.com/', '*.*')).toEqual(true);
        expect(isURLMatched('https://www.example.com/', '*.*.*')).toEqual(true);
        expect(isURLMatched('https://www.example.com/', '*.*.*.*')).toEqual(false);

        expect(isURLMatched('https://www.example.com/page/1', 'example.com')).toEqual(true);
        expect(isURLMatched('https://www.failure.com/page/1', 'example.com')).toEqual(false);
        expect(isURLMatched('https://xyz.example.com/page/1', 'example.com')).toEqual(false);
        expect(isURLMatched('https://xyz.www.example.com/page/1', 'example.com')).toEqual(false);

        expect(isURLMatched('https://xyz.example.com/page/1', '*.example.com')).toEqual(true);
        expect(isURLMatched('https://abc.xyz.example.com/page/1', '*.example.com')).toEqual(true);
        expect(isURLMatched('https://xyz.failure.com/page/1', '*.example.com')).toEqual(false);

        expect(isURLMatched('https://www.example.com/page/1', 'example.com/page')).toEqual(true);
        expect(isURLMatched('https://www.example.com/fail/1', 'example.com/page')).toEqual(false);

        expect(isURLMatched('https://example.com/page/1', '^example.com')).toEqual(true);
        expect(isURLMatched('https://www.example.com/page/1', '^example.com')).toEqual(false);

        expect(isURLMatched('https://www.example.com/', 'example.com$')).toEqual(true);
        expect(isURLMatched('https://www.example.com/page/1', 'example.com$')).toEqual(false);

        expect(isURLMatched('https://www.example.de/', 'example.*')).toEqual(true);
        expect(isURLMatched('https://www.failure.com/', 'example.*')).toEqual(false);

        expect(isURLMatched('https://www.example.co.uk/', 'example.*.*')).toEqual(true);
        expect(isURLMatched('https://www.example.com/', 'example.*.*')).toEqual(false);

        expect(isURLMatched('https://www.example.com/path/long/enough', 'example.com/path/*')).toEqual(true);
        expect(isURLMatched('https://www.failure.com/fail/long/enough', 'example.com/path/*')).toEqual(false);

        expect(isURLMatched('http://localhost:8080/', 'localhost:8080')).toEqual(true);
        expect(isURLMatched('http://localhost:1024/', 'localhost:8080')).toEqual(false);

        expect(isURLMatched('http://localhost:8080/', 'localhost:*')).toEqual(true);
        expect(isURLMatched('http://172.168.0.100:8080/', 'localhost:*')).toEqual(false);

        expect(isURLMatched('http://www.example.com/page/1', 'http://*')).toEqual(true);
        expect(isURLMatched('https://www.example.com/page/1', 'http://*')).toEqual(false);

        expect(isURLMatched('file:///C:/My%20Documents/balance.xlsx', 'file:///C:')).toEqual(true);
        expect(isURLMatched('file:///D:/Bin/cat.gif', 'file:///C:')).toEqual(false);

        expect(isURLMatched('https://www.example.com/page/1', '/www\.ex.*\.com/')).toEqual(true);
        expect(isURLMatched('https://www.failure.com/page/1', '/www\.ex.*\.com/')).toEqual(false);

        expect(isURLMatched('https://[2001:0DB8:AC10:FE01::200E]/', '[2001:0DB8:AC10:FE01::200E]')).toEqual(true);
        expect(isURLMatched('https://[2001:0DB8:AC10:FE02::200E]/', '[2001:0DB8:AC10:FE01::200E]')).toEqual(false);
        expect(isURLMatched('https://[2001:0DB8:AC10:FE01::200E]:8080/', '[2001:0DB8:AC10:FE01::200E]:8080')).toEqual(true);
        expect(isURLMatched('https://[2001:0DB8:AC10:FE02::200E]:1024/', '[2001:0DB8:AC10:FE01::200E]:8080')).toEqual(false);
    });

    test('URL is PDF', () => {
        expect(isPDF('https://www.google.com/file.pdf')).toBe(true);
        expect(isPDF('https://www.google.com/file.pdf?id=2')).toBe(true);
        expect(isPDF('https://www.google.com/file.pdf/resource')).toBe(false);
        expect(isPDF('https://www.google.com/resource?file=file.pdf')).toBe(false);
        expect(isPDF('https://www.google.com/very/good/hidden/folder/pdf#file.pdf')).toBe(false);
        expect(isPDF('https://fi.wikipedia.org/wiki/Tiedosto:ExtIPA_chart_(2015).pdf?uselang=en')).toBe(false);
        expect(isPDF('https://commons.wikimedia.org/wiki/File:ExtIPA_chart_(2015).pdf')).toBe(false);
        expect(isPDF('https://upload.wikimedia.org/wikipedia/commons/5/56/ExtIPA_chart_(2015).pdf')).toBe(true);
    });

    test('URL list index', () => {
        const simplePatterns = [
            'apple.com',
            'google.com',
        ];
        let indexed = indexURLTemplateList(simplePatterns);
        expect(isURLInIndexedList('https://apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://google.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.co.uk/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/maps', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://mail.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.example.com/', indexed)).toEqual(false);

        const wildcardPatterns = [
            'apple.com',
            'google.*',
            '*.example.com',
        ];
        indexed = indexURLTemplateList(wildcardPatterns);
        expect(isURLInIndexedList('https://apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://google.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.co.uk/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/maps', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://mail.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://example.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.example.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://test.example.com/', indexed)).toEqual(true);

        const pathPatterns = [
            'apple.com',
            'google.*/maps',
        ];
        indexed = indexURLTemplateList(pathPatterns);
        expect(isURLInIndexedList('https://apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.co.uk/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/maps', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.com/maps/edit', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.co.uk/maps', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/mail', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://mail.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.example.com/', indexed)).toEqual(false);

        const mixedPatterns = [
            'apple.com',
            'google.*/maps',
            'google.*.*/maps',
            '*.example.com',
            'office.com/*/edit',
            'mail.google.*/mail',
        ];
        indexed = indexURLTemplateList(mixedPatterns);
        expect(isURLInIndexedList('https://apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.apple.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.co.uk/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.google.com/maps', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.co.uk/maps', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.com/maps/edit', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.google.com/mail', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://mail.google.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://mail.google.com/mail/u/0/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://example.com/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.example.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://test.example.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://long.test.example.com/', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.office.com/excel/', indexed)).toEqual(false);
        expect(isURLInIndexedList('https://www.office.com/excel/edit', indexed)).toEqual(true);
        expect(isURLInIndexedList('https://www.office.com/excel/edit/2000', indexed)).toEqual(true);
    });
});

describe('Site list entries as match patterns', () => {
    test('Exact match patterns', () => {
        expect(getExactMatchPatterns('github.com')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getExactMatchPatterns('github.com/')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getExactMatchPatterns('mail.google.com')).toEqual(['*://mail.google.com/*', '*://www.mail.google.com/*']);
        expect(getExactMatchPatterns('https://github.com')).toEqual(['https://github.com/*', 'https://www.github.com/*']);
        expect(getExactMatchPatterns('^github.com')).toEqual(['*://github.com/*']);
        expect(getExactMatchPatterns('192.168.0.1')).toEqual(['*://192.168.0.1/*', '*://www.192.168.0.1/*']);

        // Can't be expressed exactly
        expect(getExactMatchPatterns('/github\\.com/')).toEqual(null);
        expect(getExactMatchPatterns('*.github.com')).toEqual(null);
        expect(getExactMatchPatterns('google.*')).toEqual(null);
        expect(getExactMatchPatterns('github.com/settings')).toEqual(null);
        expect(getExactMatchPatterns('github.com$')).toEqual(null);
        expect(getExactMatchPatterns('localhost:8080')).toEqual(null);
        expect(getExactMatchPatterns('localhost')).toEqual(null);
        expect(getExactMatchPatterns('GitHub.com')).toEqual(null);
        expect(getExactMatchPatterns('file:///home/')).toEqual(null);
        expect(getExactMatchPatterns('[::1]')).toEqual(null);
        expect(getExactMatchPatterns('')).toEqual(null);
    });

    test('Entries that convert exactly match the same URLs as their patterns', () => {
        const urls = [
            'https://github.com/',
            'http://github.com/darkreader/darkreader',
            'https://www.github.com/',
            'https://gist.github.com/',
            'https://www.www.github.com/',
            'https://github.com:8443/',
            'https://notgithub.com/',
        ];
        // *://github.com/* and *://www.github.com/* match the 1st, 2nd, 3rd and 6th
        expect(urls.map((url) => isURLMatched(url, 'github.com'))).toEqual([true, true, true, false, false, true, false]);
        // *://github.com/* matches the 1st, 2nd and 6th
        expect(urls.map((url) => isURLMatched(url, '^github.com'))).toEqual([true, true, false, false, false, true, false]);
    });

    test('Broad match patterns', () => {
        expect(getBroadMatchPatterns('github.com')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getBroadMatchPatterns('github.com/settings')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getBroadMatchPatterns('github.com:8080$')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getBroadMatchPatterns('*.github.com')).toEqual(['*://*.github.com/*']);
        expect(getBroadMatchPatterns('localhost')).toEqual(['*://*.localhost/*']);
        expect(getBroadMatchPatterns('GitHub.com')).toEqual(['*://github.com/*', '*://www.github.com/*']);
        expect(getBroadMatchPatterns('https://github.com')).toEqual(['https://github.com/*', 'https://www.github.com/*']);

        // Can't be covered
        expect(getBroadMatchPatterns('/github\\.com/')).toEqual(null);
        expect(getBroadMatchPatterns('google.*')).toEqual(null);
        expect(getBroadMatchPatterns('*')).toEqual(null);
        expect(getBroadMatchPatterns('file:///home/')).toEqual(null);
    });

    test('Entry may match host', () => {
        expect(mayMatchHost('github.com', 'github.com')).toEqual(true);
        expect(mayMatchHost('github.com', 'www.github.com')).toEqual(true);
        expect(mayMatchHost('github.com/settings', 'github.com')).toEqual(true);
        expect(mayMatchHost('https://github.com:8443', 'github.com')).toEqual(true);
        expect(mayMatchHost('*.com', 'github.com')).toEqual(true);
        expect(mayMatchHost('*', 'github.com')).toEqual(true);
        expect(mayMatchHost('/anything/', 'github.com')).toEqual(true);
        expect(mayMatchHost('^github.com', 'www.github.com')).toEqual(false);
        expect(mayMatchHost('gist.github.com', 'github.com')).toEqual(false);
        expect(mayMatchHost('gitlab.com', 'github.com')).toEqual(false);
        expect(mayMatchHost('file:///home/', 'github.com')).toEqual(false);
    });
});
