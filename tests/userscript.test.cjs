const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'YouTube-Cleaner.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const instrumentedSource = source.replace(
    /\n    start\(\);\s*\}\)\(\);\s*$/,
    '\n    globalThis.ytcTest = { applyState, createWatchedModeSlider, mutationNeedsCleanup, readEmbeddedJson, collaborationConfig, loadCollaborationSubscriptions, lookupCollaborationUploader, getSettings: () => settings };\n    start();\n})();'
);

assert.notEqual(instrumentedSource, source, 'Userscript entry point not found');

function createHarness(savedSettings = {}, pathname = '/', overrides = {}) {
    let css = '';
    let observerOptions;
    let savedValue;
    const windowListeners = {};
    const location = { pathname, search: '', replace() {} };
    const root = { dataset: {} };

    class FakeElement {
        constructor(owned = false) {
            this.owned = owned;
            this.children = [];
            this.listeners = {};
            this.attributes = {};
        }

        closest() {
            return this.owned ? this : null;
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }

        addEventListener(type, listener) {
            this.listeners[type] = listener;
        }

        setAttribute(name, value) {
            this.attributes[name] = value;
        }
    }

    const context = {
        console,
        Element: FakeElement,
        HTMLInputElement: FakeElement,
        DocumentFragment: class {},
        Intl,
        URL,
        URLSearchParams,
        AbortController,
        setTimeout,
        clearTimeout,
        navigator: { language: 'en-US' },
        location,
        localStorage: {
            getItem() { return JSON.stringify(savedSettings); },
            setItem(_key, value) { savedValue = value; }
        },
        document: {
            documentElement: root,
            createElement() { return new FakeElement(); },
            getElementById() { return null; },
            getElementsByClassName() { return []; },
            addEventListener() {}
        },
        window: {
            setTimeout() { return 1; },
            addEventListener(name, listener) { windowListeners[name] = listener; }
        },
        MutationObserver: class {
            observe(_target, options) { observerOptions = options; }
        },
        GM_addStyle(value) { css = value; },
        setInterval() { return 1; },
        ...overrides
    };

    vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });

    return {
        css,
        root,
        hooks: context.ytcTest,
        FakeElement,
        observerOptions,
        location,
        windowListeners,
        getSavedValue: () => savedValue
    };
}

test('watched-video mode migrates both switches and validates saved values', () => {
    const defaults = createHarness();
    assert.equal(defaults.hooks.getSettings().watchedVideosMode, 'off');
    assert.equal(defaults.root.dataset.ytcWatchedVideos, 'off');

    const dimmed = createHarness({ dimWatchedVideos: true });
    assert.equal(dimmed.root.dataset.ytcWatchedVideos, 'dim');
    assert.equal('dimWatchedVideos' in dimmed.hooks.getSettings(), false);

    const hidden = createHarness({ hideWatchedVideos: true, dimWatchedVideos: true });
    assert.equal(hidden.root.dataset.ytcWatchedVideos, 'hide');
    assert.equal('hideWatchedVideos' in hidden.hooks.getSettings(), false);

    const explicit = createHarness({ watchedVideosMode: 'off', hideWatchedVideos: true });
    assert.equal(explicit.root.dataset.ytcWatchedVideos, 'off');

    const invalid = createHarness({ watchedVideosMode: 'unknown', hideMixes: 'true' });
    assert.equal(invalid.root.dataset.ytcWatchedVideos, 'off');
    assert.equal(invalid.root.dataset.ytcHideMixes, 'false');

    hidden.hooks.getSettings().enabled = false;
    hidden.hooks.applyState();
    assert.equal(hidden.root.dataset.ytcWatchedVideos, 'off');
});

test('three-state slider changes and persists the watched-video mode', () => {
    const harness = createHarness({ watchedVideosMode: 'dim' });
    const wrapper = harness.hooks.createWatchedModeSlider();
    const findById = (node, id) => node.id === id
        ? node
        : node.children.map((child) => findById(child, id)).find(Boolean);
    const slider = findById(wrapper, 'ytc-watched-mode-slider');

    assert.equal(slider.value, '1');
    assert.equal(slider.attributes['aria-valuetext'], 'Dim');

    slider.value = '2';
    slider.listeners.input({ target: slider, stopPropagation() {} });
    assert.equal(harness.hooks.getSettings().watchedVideosMode, 'hide');
    assert.equal(harness.root.dataset.ytcWatchedVideos, 'hide');
    assert.equal(slider.attributes['aria-valuetext'], 'Hide');
    assert.equal(JSON.parse(harness.getSavedValue()).watchedVideosMode, 'hide');
});

test('History keeps watched videos visible and restores the saved mode after navigation', () => {
    for (const mode of ['dim', 'hide']) {
        const harness = createHarness({ watchedVideosMode: mode }, '/feed/history');
        assert.equal(harness.root.dataset.ytcWatchedVideos, 'off');
        assert.equal(harness.hooks.getSettings().watchedVideosMode, mode);

        harness.location.pathname = '/feed/subscriptions';
        harness.windowListeners['yt-navigate-finish']();
        assert.equal(harness.root.dataset.ytcWatchedVideos, mode);

        harness.location.pathname = '/feed/history/';
        harness.windowListeners.popstate();
        assert.equal(harness.root.dataset.ytcWatchedVideos, 'off');

        harness.location.pathname = '/';
        harness.windowListeners['yt-page-data-updated']();
        assert.equal(harness.root.dataset.ytcWatchedVideos, mode);
    }
});

test('YouTube JSON parsing handles escaped braces without executing scripts', () => {
    const { hooks } = createHarness();
    const json = { text: 'Title with } and " quotes and \\ backslashes', nested: { enabled: true } };
    const html = 'var ytInitialData = ' + JSON.stringify(json) + '; throw new Error("must not execute");';
    assert.equal(JSON.stringify(hooks.readEmbeddedJson(html, /ytInitialData\s*=\s*/)), JSON.stringify(json));
    assert.equal(hooks.readEmbeddedJson('ytInitialData = {broken}', /ytInitialData\s*=\s*/), null);
});

test('configuration skips non-JSON bootstrap calls used by real YouTube pages', () => {
    const { hooks } = createHarness();
    const config = { SESSION_INDEX: '0', INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test' } } };
    const prefix = "window.ytcfg.set('EMERGENCY_BASE_URL', '/error_204'); ytcfg.set(dynamicKey, dynamicValue); ytcfg.set({\"OTHER_CONFIG\":true});";
    const parsed = hooks.collaborationConfig(prefix + 'ytcfg.set(' + JSON.stringify(config) + ');');
    assert.equal(parsed.SESSION_INDEX, '0');
    assert.equal(parsed.INNERTUBE_CONTEXT.client.clientVersion, 'test');
    assert.equal(hooks.collaborationConfig(prefix), null);
});

test('collaboration subscriptions follow every page and ignore sidebar channels', async () => {
    const first = 'UC' + 'a'.repeat(22);
    const second = 'UC' + 'b'.repeat(22);
    const sidebar = 'UC' + 'c'.repeat(22);
    const config = { INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test' } }, SESSION_INDEX: '2' };
    const continuation = { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'page-two' } } } };
    const initial = {
        contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: {
            items: [{ channelRenderer: { channelId: first } }, continuation]
        } } }] } },
        sidebar: { channelRenderer: { channelId: sidebar } }
    };
    const calls = [];
    const { hooks } = createHarness({}, '/', {
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, text: async () => "window.ytcfg.set('EMERGENCY_BASE_URL', '/error_204'); ytcfg.set(" + JSON.stringify(config) + '); var ytInitialData = ' + JSON.stringify(initial) + ';',
                json: async () => ({ onResponseReceivedActions: [{ appendContinuationItemsAction: {
                    continuationItems: [{ channelRenderer: { channelId: second } }]
                } }] }) };
        }
    });
    const ids = await hooks.loadCollaborationSubscriptions(new AbortController().signal);
    assert.deepEqual([...ids].sort(), [first, second].sort());
    assert.equal(ids.has(sidebar), false);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers['X-Goog-AuthUser'], '2');
    assert.equal(JSON.parse(calls[1].options.body).continuation, 'page-two');
    assert.equal(calls[0].options.credentials, 'same-origin');
});

test('subscription sort commands are not mistaken for pagination', async () => {
    const channelId = 'UC' + 'a'.repeat(22);
    let requests = 0;
    const data = { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
        selected: true, content: { sectionListRenderer: {
            header: { chipBarViewModel: { chips: [{ chipViewModel: {
                sortItems: [0, 1, 2].map((index) => ({
                    commandExecutorCommand: { commands: [{ continuationCommand: { token: 'sort-' + index } }] }
                }))
            } }] } },
            contents: [{ channelRenderer: { channelId } }]
        } }
    } }] } } };
    const { hooks } = createHarness({}, '/', {
        fetch: async () => {
            requests++;
            return { ok: true, text: async () => 'var ytInitialData = ' + JSON.stringify(data) + ';' };
        }
    });
    const ids = await hooks.loadCollaborationSubscriptions(new AbortController().signal);
    assert.deepEqual([...ids], [channelId]);
    assert.equal(requests, 1);
});

test('incomplete subscriptions never become a usable negative lookup', async () => {
    const initial = { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
        selected: true, content: { items: [
            { channelRenderer: { channelId: 'UC' + 'a'.repeat(22) } },
            { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'more' } } } }
        ] }
    } }] } } };
    const { hooks } = createHarness({}, '/', {
        fetch: async () => ({ ok: true, text: async () => 'var ytInitialData = ' + JSON.stringify(initial) + ';' })
    });
    await assert.rejects(hooks.loadCollaborationSubscriptions(new AbortController().signal), /pagination/);
});

test('collaboration uploader comes from the requested video, never the first byline name', async () => {
    const owner = 'UC' + 'x'.repeat(22);
    const { hooks } = createHarness({}, '/', {
        fetch: async () => ({ ok: true, text: async () => 'window["ytInitialPlayerResponse"] = ' + JSON.stringify({
            videoDetails: { videoId: 'abcdefghijk', channelId: owner, author: 'Another name' }
        }) + ';' })
    });
    assert.equal(await hooks.lookupCollaborationUploader('abcdefghijk', new AbortController().signal), owner);
    assert.equal(await hooks.lookupCollaborationUploader('otherVideo1', new AbortController().signal), null);
});

test('collaboration lookup requests only video and channel IDs when player metadata is available', async () => {
    const owner = 'UC' + 'x'.repeat(22);
    const requests = [];
    const { hooks } = createHarness({}, '/', {
        fetch: async (url, options) => {
            requests.push({ url, options });
            return { ok: true, json: async () => ({ videoDetails: { videoId: 'abcdefghijk', channelId: owner } }) };
        }
    });
    assert.equal(await hooks.lookupCollaborationUploader(
        'abcdefghijk', new AbortController().signal, {}, { client: { clientName: 'WEB', clientVersion: 'test' } }
    ), owner);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url, 'https://www.youtube.com').searchParams.get('fields'), 'videoDetails(videoId,channelId)');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(JSON.parse(requests[0].options.body).videoId, 'abcdefghijk');
});

test('unusable player metadata falls back to the requested watch page without guessing the uploader', async () => {
    const owner = 'UC' + 'x'.repeat(22);
    const requests = [];
    const { hooks } = createHarness({}, '/', {
        fetch: async (url) => {
            requests.push(url);
            return { ok: true,
                json: async () => ({ videoDetails: { videoId: 'another-id1', channelId: owner } }),
                text: async () => 'var ytInitialPlayerResponse = ' + JSON.stringify({
                    videoDetails: { videoId: 'abcdefghijk', channelId: owner }
                }) + ';'
            };
        }
    });
    assert.equal(await hooks.lookupCollaborationUploader(
        'abcdefghijk', new AbortController().signal, {}, { client: { clientVersion: 'test' } }
    ), owner);
    assert.equal(requests.length, 2);
    assert.match(requests[1], /^\/watch\?v=abcdefghijk/);
});

test('a throttled player request never triggers a second watch-page request', async () => {
    const requests = [];
    const { hooks } = createHarness({}, '/', {
        fetch: async (url) => { requests.push(url); return { ok: false, status: 429 }; }
    });
    await assert.rejects(hooks.lookupCollaborationUploader(
        'abcdefghijk', new AbortController().signal, {}, { client: { clientVersion: 'test' } }
    ), (error) => error.status === 429);
    assert.equal(requests.length, 1);
});

test('unknown pagination and mismatched account data leave subscription verification unavailable', async () => {
    const makeHarness = (extra, sessionIndex = '0') => createHarness({}, '/', {
        fetch: async () => ({ ok: true, text: async () => 'ytcfg.set(' + JSON.stringify({
            SESSION_INDEX: sessionIndex, INNERTUBE_CONTEXT: { client: { clientVersion: 'test' } }
        }) + '); var ytInitialData = ' + JSON.stringify({
            contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
                selected: true, content: {
                    items: [{ channelRenderer: { channelId: 'UC' + 'a'.repeat(22) } }], ...extra
                }
            } }] } }
        }) + ';' })
    });
    await assert.rejects(
        makeHarness({ continuations: [{ nextContinuationData: { continuation: 'unrecognized' } }] }).hooks
            .loadCollaborationSubscriptions(new AbortController().signal), /Unsupported/
    );
    await assert.rejects(
        makeHarness({}, '1').hooks.loadCollaborationSubscriptions(new AbortController().signal, { 'X-Goog-AuthUser': '0' }),
        /account/
    );
});

test('hide rule covers supported video cards and progress indicators', () => {
    const { css } = createHarness();
    const hideRule = css.match(/html\[data-ytc-watched-videos="hide"\][^{]+\{[^}]+\}/)?.[0];

    assert.ok(hideRule);
    for (const renderer of [
        'ytd-rich-item-renderer',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer',
        'yt-lockup-view-model',
        'ytd-thumbnail-overlay-resume-playback-renderer',
        'yt-thumbnail-overlay-progress-bar-view-model'
    ]) {
        assert.ok(hideRule.includes(renderer), `${renderer} missing from hide rule`);
    }
    assert.match(hideRule, /display:\s*none\s*!important/);
    assert.match(css, /data-ytc-watched-videos="dim"/);
});

test('Mix filtering is opt-in and targets only Mix card patterns', () => {
    const defaults = createHarness();
    assert.equal(defaults.root.dataset.ytcHideMixes, 'false');

    const enabled = createHarness({ hideMixes: true });
    assert.equal(enabled.root.dataset.ytcHideMixes, 'true');
    const mixRule = enabled.css.match(/html\[data-ytc-hide-mixes="true"\][\s\S]+?display:\s*none\s*!important;\s*\}/)?.[0];
    assert.ok(mixRule);
    assert.match(mixRule, /ytd-radio-renderer/);
    assert.match(mixRule, /ytd-compact-radio-renderer/);
    assert.match(mixRule, /href\$="start_radio=1"/);
    assert.match(mixRule, /href\*="&start_radio=1&"/);
    assert.doesNotMatch(mixRule, /ytd-playlist-renderer/);

    enabled.hooks.getSettings().enabled = false;
    enabled.hooks.applyState();
    assert.equal(enabled.root.dataset.ytcHideMixes, 'false');
});

test('Upcoming subscriptions filter is opt-in, page-scoped, and reversible', () => {
    const defaults = createHarness();
    assert.equal(defaults.root.dataset.ytcHideUpcoming, 'false');

    const invalid = createHarness({ hideUpcomingVideos: 'true' });
    assert.equal(invalid.root.dataset.ytcHideUpcoming, 'false');

    const enabled = createHarness({ hideUpcomingVideos: true });
    assert.equal(enabled.root.dataset.ytcHideUpcoming, 'true');

    const upcomingRule = enabled.css.match(/html\[data-ytc-hide-upcoming="true"\][\s\S]+?display:\s*none\s*!important;\s*\}/)?.[0];
    assert.ok(upcomingRule);
    assert.match(upcomingRule, /ytd-browse\[page-subtype="subscriptions"\]/);
    assert.match(upcomingRule, /overlay-style="UPCOMING"/);
    assert.match(upcomingRule, /lockup-attachments-view-model toggle-button-view-model/);

    enabled.hooks.getSettings().enabled = false;
    enabled.hooks.applyState();
    assert.equal(enabled.root.dataset.ytcHideUpcoming, 'false');
});

test('Shorts cleanup reacts to reused links without observing our own UI', () => {
    const { hooks, FakeElement, observerOptions } = createHarness();

    assert.equal(observerOptions.attributes, true);
    assert.ok(observerOptions.attributeFilter.includes('href'));
    assert.equal(hooks.mutationNeedsCleanup([
        { type: 'attributes', target: new FakeElement() }
    ]), true);
    assert.equal(hooks.mutationNeedsCleanup([
        { type: 'attributes', target: new FakeElement(true) }
    ]), false);

    const shortsDisabled = createHarness({ hideShorts: false });
    assert.equal(shortsDisabled.hooks.mutationNeedsCleanup([
        { type: 'attributes', target: new shortsDisabled.FakeElement() }
    ]), false);
});
