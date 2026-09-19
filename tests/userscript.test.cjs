const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'YouTube-Cleaner.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const instrumentedSource = source.replace(
    /\n    start\(\);\s*\}\)\(\);\s*$/,
    '\n    globalThis.ytcTest = { applyState, createWatchedModeSlider, mutationNeedsCleanup, getSettings: () => settings };\n    start();\n})();'
);

assert.notEqual(instrumentedSource, source, 'Userscript entry point not found');

function createHarness(savedSettings = {}) {
    let css = '';
    let observerOptions;
    let savedValue;
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
        URLSearchParams,
        navigator: { language: 'en-US' },
        location: { pathname: '/', search: '', replace() {} },
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
            addEventListener() {}
        },
        MutationObserver: class {
            observe(_target, options) { observerOptions = options; }
        },
        GM_addStyle(value) { css = value; },
        setInterval() { return 1; }
    };

    vm.runInNewContext(instrumentedSource, context, { filename: scriptPath });

    return {
        css,
        root,
        hooks: context.ytcTest,
        FakeElement,
        observerOptions,
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
