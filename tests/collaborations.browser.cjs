// Browser regression helper: accepts a Playwright Page and userscript source.
module.exports = async (page, userscript) => {
    const testPage = await page.context().newPage();
    const errors = [];
    testPage.on('pageerror', (error) => errors.push(error.message));
    const followed = 'UC' + 'a'.repeat(22);
    const followedLater = 'UC' + 'b'.repeat(22);
    const foreign = 'UC' + 'c'.repeat(22);
    const vaykeSavun = 'UC' + 'd'.repeat(22);
    const config = { INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test' } }, SESSION_INDEX: '0' };
    const continuation = { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'remaining-subscriptions' } } } };
    const initial = {
        contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: {
            sectionListRenderer: {
                header: { chipBarViewModel: { sortOptions: [0, 1, 2].map((index) => ({
                    commandExecutorCommand: { commands: [{ continuationCommand: { token: 'sort-' + index } }] }
                })) } },
                contents: [{ channelRenderer: { channelId: followed } }, continuation]
            }
        } } }] } },
        sidebar: { channelRenderer: { channelId: foreign } }
    };
    const owners = { followed001: followed, laterPage01: followedLater, foreign0001: foreign, vaykesavun1: vaykeSavun, pending0001: foreign };
    const calls = [];
    const watchPages = [];
    let playerRequests = 0;
    let active = 0;
    let maxActive = 0;
    let paginationFails = false;
    let releasePending;
    const pendingGate = new Promise((resolve) => { releasePending = resolve; });
    const card = (id, videoId, collab = true, byline = 'Familiar channel and others') => '<ytd-rich-item-renderer id="' + id + '"><yt-lockup-view-model>' +
        (collab ? '<yt-avatar-stack-view-model></yt-avatar-stack-view-model>' : '') +
        '<a href="/watch?v=' + videoId + '">Video</a><span>' + byline + '</span></yt-lockup-view-model></ytd-rich-item-renderer>';
    const fixture = '<!doctype html><html><head><style>ytd-rich-item-renderer, yt-lockup-view-model, ytd-browse { display:block; margin:10px; }</style></head><body>' +
        '<script>window.ytcfg={set(){}}; window.ytcfg.set("EMERGENCY_BASE_URL", "/error_204"); ytcfg.set(' + JSON.stringify(config) + ');</script>' +
        '<ytd-masthead><div id="end"><div id="buttons"></div></div></ytd-masthead>' +
        '<ytd-browse page-subtype="subscriptions" id="feed">' +
        card('subscribed', 'followed001', true, 'Le Routin et Le Routin TCG') +
        card('later-page', 'laterPage01', true, 'Savun') +
        card('foreign', 'foreign0001', true, 'Le Routin TCG et Le Routin') +
        card('vayke', 'vaykesavun1', true, 'Vayke Savun et Savun') + card('duplicate', 'foreign0001') +
        card('unknown', 'unknown0001') + card('ordinary', 'foreign0001', false) + '</ytd-browse></body></html>';
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const visible = async (id, expected) => assert(await testPage.locator('#' + id).isVisible() === expected, id + ' visibility mismatch');
    const toggle = () => testPage.locator('[data-setting="hideUnsubscribedCollaborations"]').click();
    try {
        await testPage.route('https://ytc-collaborations.test/**', async (route) => {
            const url = new URL(route.request().url());
            if (url.pathname === '/feed/channels') {
                calls.push('subscriptions');
                return route.fulfill({ contentType: 'text/html', body: 'window.ytcfg.set("EMERGENCY_BASE_URL", "/error_204"); ytcfg.set(' + JSON.stringify(config) + '); var ytInitialData = ' + JSON.stringify(initial) + ';' });
            }
            if (url.pathname === '/youtubei/v1/browse') {
                calls.push('continuation');
                assert(route.request().postDataJSON().continuation === 'remaining-subscriptions', 'Wrong continuation');
                return route.fulfill({ status: paginationFails ? 500 : 200, contentType: 'application/json', body: JSON.stringify({
                    onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
                        { channelRenderer: { channelId: followedLater } }
                    ] } }]
                }) });
            }
            if (url.pathname === '/youtubei/v1/player' || url.pathname === '/watch') {
                const isPlayer = url.pathname === '/youtubei/v1/player';
                const videoId = isPlayer ? route.request().postDataJSON().videoId : url.searchParams.get('v');
                if (isPlayer) {
                    playerRequests++;
                    assert(url.searchParams.get('fields') === 'videoDetails(videoId,channelId)', 'Player response must be limited to the needed IDs');
                } else {
                    watchPages.push(videoId);
                }
                calls.push(videoId);
                active++;
                maxActive = Math.max(active, maxActive);
                if (videoId === 'pending0001') await pendingGate;
                const data = owners[videoId] ? { videoDetails: { videoId, channelId: owners[videoId] } } : {};
                try {
                    await route.fulfill({
                        contentType: isPlayer ? 'application/json' : 'text/html',
                        body: isPlayer ? JSON.stringify(data) : 'var ytInitialPlayerResponse = ' + JSON.stringify(data) +
                            '; <script>window.fetchedScriptExecuted = true;</script>'
                    });
                } catch { /* A disabled filter aborts pending requests. */ }
                active--;
                return;
            }
            return route.fulfill({ contentType: 'text/html', body: fixture });
        });
        await testPage.goto('https://ytc-collaborations.test/feed/subscriptions');
        await testPage.evaluate(() => localStorage.setItem('yt_cleaner_settings_v1', JSON.stringify({ hideShorts: false })));
        await testPage.addScriptTag({ content: userscript });
        await testPage.locator('#ytc-button').waitFor();
        assert(calls.length === 0, 'Disabled option must not fetch anything');
        await testPage.locator('#ytc-button').click();
        await testPage.getByRole('tab', { name: 'Subscriptions', exact: true }).click();
        await toggle();
        await testPage.locator('#foreign').waitFor({ state: 'hidden' });
        for (const id of ['subscribed', 'later-page', 'unknown', 'ordinary']) await visible(id, true);
        await visible('duplicate', false);
        await visible('vayke', false);
        await testPage.waitForFunction(() => document.getElementById('ytc-collaboration-status')?.textContent.includes('3 collaboration videos hidden'));
        assert(calls.filter((id) => id === 'foreign0001').length === 1, 'Duplicate videos must share a lookup');
        assert(playerRequests > 0 && watchPages.every((id) => id === 'unknown0001'), 'Known uploaders must not require complete watch pages');
        assert(calls.includes('continuation'), 'Must load all subscription pages');
        assert(maxActive <= 2, 'Video request concurrency must be bounded');
        assert(await testPage.evaluate(() => !window.fetchedScriptExecuted), 'Fetched watch-page scripts must never execute');

        // YouTube reuses cards; Shorts is deliberately disabled for this check.
        await testPage.locator('#foreign a').evaluate((link) => link.setAttribute('href', '/watch?v=followed001'));
        await testPage.locator('#foreign').waitFor({ state: 'visible' });
        await toggle();
        await visible('duplicate', true);

        paginationFails = true;
        const failure = testPage.waitForEvent('console', { predicate: (message) => message.text().includes('Could not verify subscriptions') });
        await toggle();
        await failure;
        assert(/could not|denied|failed/i.test(await testPage.locator('#ytc-collaboration-status').textContent()), 'Failed subscription checks must explain why filtering is unavailable');
        await visible('duplicate', true);
        await visible('later-page', true);
        await toggle();
        paginationFails = false;
        await toggle();
        await testPage.locator('#duplicate').waitFor({ state: 'hidden' });

        // A late response must not hide anything after the option has been switched off.
        const pendingRequest = testPage.waitForRequest((request) =>
            request.url().includes('/youtubei/v1/player') && request.postDataJSON()?.videoId === 'pending0001'
        );
        await testPage.locator('#feed').evaluate((feed, html) => feed.insertAdjacentHTML('beforeend', html), card('pending', 'pending0001'));
        await pendingRequest;
        await toggle();
        releasePending();
        await visible('pending', true);
        await visible('duplicate', true);

        const beforeLeaving = calls.length;
        await testPage.evaluate(() => {
            history.pushState({}, '', '/');
            document.getElementById('feed').setAttribute('page-subtype', 'home');
            window.dispatchEvent(new Event('yt-navigate-finish'));
        });
        await toggle();
        await visible('duplicate', true);
        assert(calls.length === beforeLeaving, 'Must not fetch or hide outside Subscriptions');
        assert(errors.length === 0, errors.join('\n'));
        return { passed: true, checks: ['Le Routin kept, Le Routin TCG and Vayke Savun hidden', 'minimal player metadata with watch-page fallback', 'real YouTube bootstrap prefix', 'pagination and sidebar isolation', 'deduplication and bounded concurrency', 'unknown data stays visible', 'reused cards', 'failed pagination with visible status', 'disable during request', 'Subscriptions scope'], pageErrors: errors };
    } finally {
        releasePending();
        await testPage.close();
    }
};
