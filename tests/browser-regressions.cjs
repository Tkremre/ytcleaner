// Run with a Playwright Page and the userscript source; no additional dependencies.
module.exports = async (page, userscript) => {
    const testPage = await page.context().newPage();
    const failures = [];
    testPage.on('pageerror', (error) => failures.push(error.message));
    const fixture = `<!doctype html><html><head><style>
        body { font: 14px Arial; margin: 16px; }
        ytd-browse, ytd-rich-item-renderer, ytd-rich-section-renderer,
        ytd-rich-shelf-renderer, yt-lockup-view-model, grid-shelf-view-model,
        ytd-video-renderer, ytd-guide-entry-renderer { display: block; margin: 8px; }
        #preview-video { position: relative; width: 260px; height: 100px; background: #ddd; }
        #preview-label { position: absolute; top: 5px; left: 5px; padding: 8px; }
        #mute { position: absolute; bottom: 5px; right: 5px; }
    </style></head><body>
        <ytd-masthead><div id="end"><div id="buttons"></div></div></ytd-masthead>
        <ytd-guide-entry-renderer id="games-nav"><a href="/feed/playables">Games</a></ytd-guide-entry-renderer>
        <ytd-browse id="feed" page-subtype="history">
            <ytd-video-renderer id="watched-legacy">Watched video
                <ytd-thumbnail-overlay-resume-playback-renderer></ytd-thumbnail-overlay-resume-playback-renderer>
            </ytd-video-renderer>
            <ytd-rich-item-renderer id="watched-modern"><yt-lockup-view-model>Watched modern video
                <yt-thumbnail-overlay-progress-bar-view-model></yt-thumbnail-overlay-progress-bar-view-model>
            </yt-lockup-view-model></ytd-rich-item-renderer>
            <ytd-rich-item-renderer id="ordinary"><yt-lockup-view-model>Regular video about games and music</yt-lockup-view-model></ytd-rich-item-renderer>
            <ytd-rich-section-renderer id="games"><ytd-rich-shelf-renderer is-playables>
                <ytd-rich-item-renderer><a href="/playables/game-id">Game</a></ytd-rich-item-renderer>
            </ytd-rich-shelf-renderer></ytd-rich-section-renderer>
            <grid-shelf-view-model id="games-modern"><a href="/playables/other-game">Game</a></grid-shelf-view-model>
            <ytd-rich-section-renderer id="music"><ytd-rich-shelf-renderer>
                <ytd-rich-item-renderer><yt-lockup-view-model>Music selection</yt-lockup-view-model></ytd-rich-item-renderer>
            </ytd-rich-shelf-renderer></ytd-rich-section-renderer>
            <grid-shelf-view-model id="thematic"><yt-lockup-view-model>Grouped recommendation</yt-lockup-view-model></grid-shelf-view-model>
            <ytd-rich-section-renderer id="shorts"><ytd-rich-shelf-renderer is-shorts>
                <yt-lockup-view-model><a href="/shorts/example">Short</a></yt-lockup-view-model>
            </ytd-rich-shelf-renderer></ytd-rich-section-renderer>
            <ytd-rich-section-renderer id="nudge"><ytd-feed-nudge-renderer>History is disabled</ytd-feed-nudge-renderer></ytd-rich-section-renderer>
            <ytd-rich-item-renderer id="preview-card"><div id="preview-video" role="button" tabindex="0" onclick="this.dataset.clicks = Number(this.dataset.clicks || 0) + 1">
                Video preview <a id="preview-label" class="ytmPaidContentOverlayHost" href="https://support.google.com/youtube?p=ppp">Paid promotion</a>
                <button id="mute" onclick="event.stopPropagation()">Mute</button>
            </div></ytd-rich-item-renderer>
            <div class="ytp-inline-preview-mode"><div id="legacy-label" class="ytp-paid-content-overlay">Paid promotion</div></div>
        </ytd-browse>
        <ytd-browse page-subtype="channels"><grid-shelf-view-model id="channel-shelf"><yt-lockup-view-model>Channel videos</yt-lockup-view-model></grid-shelf-view-model></ytd-browse>
        <div id="movie_player"><div id="main-player-label" class="ytp-paid-content-overlay">Paid promotion in main player</div></div>
    </body></html>`;
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const visible = async (selector, expected) => {
        assert(await testPage.locator(selector).isVisible() === expected, `${selector}: expected visible=${expected}`);
    };
    const navigate = (pathname, subtype, eventName = 'yt-navigate-finish') => testPage.evaluate(
        ({ pathname, subtype, eventName }) => {
            history.pushState({}, '', pathname);
            document.getElementById('feed').setAttribute('page-subtype', subtype);
            window.dispatchEvent(new Event(eventName));
        }, { pathname, subtype, eventName }
    );
    const toggle = (setting) => testPage.locator(`[data-setting="${setting}"]`).click();
    try {
        await testPage.route('https://ytcleaner.test/**', (route) => route.fulfill({ contentType: 'text/html', body: fixture }));
        await testPage.goto('https://ytcleaner.test/feed/history');
        await testPage.evaluate(() => localStorage.setItem('yt_cleaner_settings_v1', JSON.stringify({ watchedVideosMode: 'hide', hideShorts: false })));
        await testPage.addScriptTag({ content: userscript });
        await testPage.locator('#ytc-button').waitFor();
        await visible('#watched-legacy', true);
        await visible('#watched-modern', true);
        await navigate('/', 'home');
        await visible('#watched-legacy', false);
        await visible('#watched-modern', false);
        await visible('#ordinary', true);
        await navigate('/feed/history/', 'history', 'popstate');
        await visible('#watched-legacy', true);
        await visible('#watched-modern', true);
        await navigate('/', 'home');
        await testPage.locator('#ytc-button').click();
        assert(await testPage.getByRole('tab').count() === 3, 'Settings need three reachable sections');
        await testPage.keyboard.press('ArrowRight');
        assert(await testPage.getByRole('tab', { name: 'Subscriptions', exact: true }).getAttribute('aria-selected') === 'true', 'Arrow keys must switch sections');
        assert(await testPage.locator('#ytc-watched-mode-slider').isVisible() === false, 'Inactive sections must be hidden');
        await testPage.keyboard.press('End');
        assert(await testPage.locator('#ytc-column-slider').isVisible(), 'End must reach Layout');
        await testPage.keyboard.press('Home');
        const experimental = await testPage.locator('.ytc-row:has(.ytc-experimental) button[data-setting]').evaluateAll(
            (buttons) => buttons.map((button) => button.dataset.setting).sort()
        );
        assert(JSON.stringify(experimental) === JSON.stringify(['hideHomeShelves', 'hideUnsubscribedCollaborations', 'hideUpcomingVideos'].sort()), 'Experimental markers must identify the fragile options');
        assert(await testPage.locator('[data-setting="hideUnsubscribedCollaborations"]').getAttribute('aria-describedby').then(value => value.includes('ytc-experimental-hideUnsubscribedCollaborations')), 'Experimental options need an accessible explanation');
        for (const dark of [false, true]) {
            await testPage.evaluate((dark) => document.documentElement.toggleAttribute('dark', dark), dark);
            const activeColor = await testPage.locator('[data-setting="enabled"]').evaluate((button) => getComputedStyle(button).backgroundColor);
            await toggle('enabled');
            assert(await testPage.locator('#ytc-help-enabled').textContent() === 'Paused', 'Master switch must explain when cleanup is paused');
            const inactiveColor = await testPage.locator('[data-setting="enabled"]').evaluate((button) => getComputedStyle(button).backgroundColor);
            assert(activeColor !== inactiveColor, 'On/off states must stay visually distinct in both themes');
            await toggle('enabled');
            assert(await testPage.locator('#ytc-help-enabled').textContent() === 'Active', 'Master switch must explain when cleanup is active');
        }
        await testPage.evaluate(() => document.documentElement.removeAttribute('dark'));
        await testPage.locator('#ytc-watched-mode-slider').evaluate((slider) => {
            slider.value = '0';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        for (const selector of ['#games', '#games-modern', '#games-nav', '#music', '#thematic', '#preview-label', '#legacy-label']) await visible(selector, true);
        await toggle('hideHomeShelves');
        await visible('#music', false);
        await visible('#thematic', false);
        for (const selector of ['#games', '#games-modern', '#games-nav', '#shorts', '#ordinary', '#channel-shelf', '#nudge']) await visible(selector, true);
        await navigate('/results', 'search');
        await visible('#music', true);
        await navigate('/', 'home');
        await toggle('hidePlayables');
        for (const selector of ['#games', '#games-modern', '#games-nav']) await visible(selector, false);
        await toggle('hideHomeShelves');
        await visible('#music', true);
        await visible('#games', false);
        await toggle('hideHomeShelves');
        await toggle('hidePaidPromotion');
        await visible('#preview-label', false);
        await visible('#legacy-label', false);
        await visible('#mute', true);
        await visible('#main-player-label', true);
        await testPage.keyboard.press('Escape');
        await testPage.locator('#preview-video').click({ position: { x: 20, y: 15 } });
        assert(await testPage.locator('#preview-video').getAttribute('data-clicks') === '1', 'Click must reach the video preview');
        await testPage.locator('#ytc-button').click();
        await testPage.getByRole('tab', { name: 'Layout', exact: true }).click();
        await testPage.setViewportSize({ width: 390, height: 520 });
        const bounds = await testPage.locator('#ytc-menu').evaluate((menu) => {
            const rect = menu.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
        });
        assert(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height, 'Settings must fit a small viewport');
        await testPage.getByRole('button', { name: 'Close settings', exact: true }).click();
        assert(await testPage.locator('#ytc-menu').isVisible() === false, 'Close button must dismiss settings');
        assert(await testPage.locator('#ytc-button').evaluate((button) => button === document.activeElement), 'Closing settings must restore focus');
        await testPage.locator('#ytc-button').click();
        assert(await testPage.getByRole('tab', { name: 'Layout', exact: true }).getAttribute('aria-selected') === 'true', 'Reopening must keep the chosen section');
        await testPage.getByRole('tab', { name: 'Videos', exact: true }).click();
        await testPage.setViewportSize({ width: 1280, height: 800 });
        await testPage.locator('#ytc-watched-mode-slider').evaluate((slider) => {
            slider.value = '2';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await navigate('/feed/history', 'history');
        await testPage.reload();
        await testPage.addScriptTag({ content: userscript });
        await testPage.locator('#ytc-button').waitFor();
        await visible('#watched-legacy', true);
        const saved = await testPage.evaluate(() => JSON.parse(localStorage.getItem('yt_cleaner_settings_v1')));
        assert(saved.watchedVideosMode === 'hide' && saved.hidePlayables && saved.hideHomeShelves && saved.hidePaidPromotion, 'Settings must survive a reload');
        await navigate('/', 'home');
        await visible('#watched-modern', false);
        await testPage.locator('#ytc-button').click();
        await toggle('enabled');
        for (const selector of ['#watched-legacy', '#watched-modern', '#games', '#games-modern', '#games-nav', '#music', '#thematic', '#preview-label', '#legacy-label']) await visible(selector, true);
        assert(failures.length === 0, failures.join('\n'));
        return { passed: true, checks: ['History and SPA navigation', 'independent optional filters', 'normal videos and channel/search shelves', 'preview clicks and controls', 'settings persistence', 'master switch', 'keyboard tabs and close/focus behavior', 'experimental feature explanations', 'small viewport and light/dark controls'], pageErrors: failures };
    } finally {
        await testPage.close();
    }
};
