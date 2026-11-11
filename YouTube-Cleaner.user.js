// ==UserScript==
// @name         YouTube Cleaner - Hide Shorts & Clean Layout
// @namespace    https://github.com/Tkremre/ytcleaner
// @version      1.4.0
// @description  Hide Shorts, watched videos, and Mixes; clean subscriptions, customize the grid, and optionally show dislikes.
// @author       Tkremre
// @license      MIT
// @homepageURL  https://github.com/Tkremre/ytcleaner
// @supportURL   https://github.com/Tkremre/ytcleaner/issues
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      returnyoutubedislikeapi.com
// @run-at       document-start
// @noframes
// @updateURL    https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'yt_cleaner_settings_v1';
    const DISLIKE_API_URL = 'https://returnyoutubedislikeapi.com/votes?videoId=';

    const DEFAULTS = {
        enabled: true,
        columns: '5',
        automaticColumns: false,
        hideShorts: true,
        watchedVideosMode: 'off',
        hideMixes: false,
        hidePlayables: false,
        hideHomeShelves: false,
        hidePaidPromotion: false,
        hideSubscriptionSections: true,
        hideUpcomingVideos: false,
        hideUnsubscribedCollaborations: false,
        showDislikes: false
    };

    const VALID_COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const WATCHED_VIDEO_MODES = ['off', 'dim', 'hide'];
    const WATCHED_VIDEO_MODE_LABELS = ['Off', 'Dim', 'Hide'];
    const EXPERIMENTAL_SETTINGS = {
        hideHomeShelves: 'Grouped recommendations vary between YouTube layouts.',
        hideUpcomingVideos: 'Upcoming-video indicators can vary between YouTube layouts.',
        hideUnsubscribedCollaborations: 'Uses YouTube subscription and uploader metadata that can change.'
    };
    const HIDDEN_SHORTS_CLASS = 'ytc-hidden-shorts';
    const HIDDEN_SUBSCRIPTIONS_CLASS = 'ytc-hidden-subscriptions';
    const HIDDEN_COLLABORATIONS_CLASS = 'ytc-hidden-collaboration';
    const COLLABORATION_MARKER = 'yt-avatar-stack-view-model, [aria-label="Collaboration channels"]';
    const COLLABORATION_CACHE_TTL = 5 * 60 * 1000;
    const DISLIKE_CACHE_MAX_SIZE = 100;

    const SUBSCRIPTION_NOISE_CONTAINER_SELECTOR = [
        'ytd-rich-section-renderer',
        'ytd-reel-shelf-renderer',
        'grid-shelf-view-model'
    ].join(',');

    const SUBSCRIPTION_NOISE_CONTENT_SELECTOR = [
        'ytd-rich-shelf-renderer',
        'ytd-reel-shelf-renderer',
        'ytd-horizontal-card-list-renderer',
        'grid-shelf-view-model',
        'yt-horizontal-list-renderer',
        'ytd-post-renderer',
        'ytd-backstage-post-thread-renderer'
    ].join(',');

    let settings = loadSettings();
    let cleanupQueued = false;
    let started = false;
    let currentDislikeVideoId = '';
    let currentDislikeRequestId = 0;
    let lastDislikeRefreshAt = 0;
    const dislikeCache = new Map();
    const reportedCleanupErrors = new Set();
    let collaborationSubscriptions = null;
    let collaborationRequest = null;
    let collaborationRetryAt = 0;
    let collaborationStatus = '';
    let currentMenuTab = 'videos';
    const collaborationUploaders = new Map();

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const loaded = {
                ...DEFAULTS,
                ...saved
            };

            loaded.enabled = typeof loaded.enabled === 'boolean'
                ? loaded.enabled
                : DEFAULTS.enabled;
            loaded.columns = String(loaded.columns);

            if (!VALID_COLUMNS.includes(loaded.columns)) {
                loaded.columns = DEFAULTS.columns;
            }

            loaded.hideShorts = typeof saved.hideShorts === 'boolean'
                ? saved.hideShorts
                : saved.shortsMode
                    ? saved.shortsMode === 'hide'
                    : DEFAULTS.hideShorts;

            loaded.automaticColumns = typeof loaded.automaticColumns === 'boolean'
                ? loaded.automaticColumns
                : DEFAULTS.automaticColumns;
            loaded.watchedVideosMode = WATCHED_VIDEO_MODES.includes(saved.watchedVideosMode)
                ? saved.watchedVideosMode
                : saved.hideWatchedVideos === true
                    ? 'hide'
                    : saved.dimWatchedVideos === true
                        ? 'dim'
                        : DEFAULTS.watchedVideosMode;
            loaded.hideMixes = typeof loaded.hideMixes === 'boolean'
                ? loaded.hideMixes
                : DEFAULTS.hideMixes;
            loaded.hidePlayables = typeof loaded.hidePlayables === 'boolean'
                ? loaded.hidePlayables
                : DEFAULTS.hidePlayables;
            loaded.hideHomeShelves = typeof loaded.hideHomeShelves === 'boolean'
                ? loaded.hideHomeShelves
                : DEFAULTS.hideHomeShelves;
            loaded.hidePaidPromotion = typeof loaded.hidePaidPromotion === 'boolean'
                ? loaded.hidePaidPromotion
                : DEFAULTS.hidePaidPromotion;
            loaded.hideSubscriptionSections = typeof loaded.hideSubscriptionSections === 'boolean'
                ? loaded.hideSubscriptionSections
                : DEFAULTS.hideSubscriptionSections;
            loaded.hideUpcomingVideos = typeof loaded.hideUpcomingVideos === 'boolean'
                ? loaded.hideUpcomingVideos
                : DEFAULTS.hideUpcomingVideos;
            loaded.hideUnsubscribedCollaborations = typeof loaded.hideUnsubscribedCollaborations === 'boolean'
                ? loaded.hideUnsubscribedCollaborations
                : DEFAULTS.hideUnsubscribedCollaborations;
            loaded.showDislikes = typeof loaded.showDislikes === 'boolean'
                ? loaded.showDislikes
                : DEFAULTS.showDislikes;

            delete loaded.shortsMode;
            delete loaded.redirectShorts;
            delete loaded.redirectHomeToSubscriptions;
            delete loaded.hideCommunityPosts;
            delete loaded.cleanSidebar;
            delete loaded.dimWatchedVideos;
            delete loaded.hideWatchedVideos;

            return loaded;
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Keep the current session functional when storage is unavailable.
        }

        applyState();
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0131/g, 'i')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function queryAll(selector, root = document) {
        try {
            return Array.from(root.querySelectorAll(selector));
        } catch {
            return [];
        }
    }

    function hideElement(element, className) {
        if (!element) return;
        element.classList.add(className);
    }

    function unhideElements(className) {
        const elements = document.getElementsByClassName(className);

        while (elements.length > 0) {
            elements[0].classList.remove(className);
        }
    }

    function isSubscriptionsPage() {
        return location.pathname === '/feed/subscriptions';
    }

    function getCardContainer(element) {
        return element.closest([
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-reel-shelf-renderer',
            'ytd-rich-section-renderer',
            'yt-lockup-view-model',
            'grid-shelf-view-model',
            'ytd-guide-entry-renderer',
            'ytd-mini-guide-entry-renderer',
            'ytd-guide-collapsible-entry-renderer'
        ].join(',')) || element;
    }

    function redirectShortsPage() {
        if (!settings.enabled || !settings.hideShorts) return;

        if (location.pathname.startsWith('/shorts/')) {
            location.replace('https://www.youtube.com/');
        }
    }

    function hideShortsNavigation() {
        if (!settings.enabled || !settings.hideShorts) return;

        queryAll([
            'ytd-guide-entry-renderer a[href="/shorts"]',
            'ytd-guide-entry-renderer a[href="/shorts/"]',
            'ytd-mini-guide-entry-renderer a[href="/shorts"]',
            'ytd-mini-guide-entry-renderer a[href="/shorts/"]',
            'ytd-guide-collapsible-entry-renderer a[href="/shorts"]',
            'ytd-guide-collapsible-entry-renderer a[href="/shorts/"]'
        ].join(',')).forEach((link) => {
            hideElement(getCardContainer(link), HIDDEN_SHORTS_CLASS);
        });
    }

    function hideShortsContent() {
        if (!settings.enabled || !settings.hideShorts) return;

        const selectors = [
            'ytd-reel-shelf-renderer',
            'ytd-rich-shelf-renderer[is-shorts]',
            'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',

            'ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
            'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
            'ytd-compact-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',

            'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
            'yt-lockup-view-model:has(a[href^="/shorts/"])',
            'grid-shelf-view-model:has(a[href^="/shorts/"])'
        ];

        queryAll(selectors.join(',')).forEach((element) => {
            hideElement(element, HIDDEN_SHORTS_CLASS);
        });

        queryAll('a[href^="/shorts/"], a[href="/shorts"], a[href*="youtube.com/shorts/"]').forEach((link) => {
            hideElement(getCardContainer(link), HIDDEN_SHORTS_CLASS);
        });
    }

    function hideShorts() {
        // YouTube can reuse a card with a new URL, so reclassify previously hidden cards.
        unhideElements(HIDDEN_SHORTS_CLASS);
        hideShortsNavigation();
        hideShortsContent();
    }

    function hideSubscriptionSections() {
        if (
            !settings.enabled ||
            !settings.hideSubscriptionSections ||
            !isSubscriptionsPage()
        ) {
            unhideElements(HIDDEN_SUBSCRIPTIONS_CLASS);
            return;
        }

        queryAll(SUBSCRIPTION_NOISE_CONTAINER_SELECTOR).forEach((section) => {
            const hasNoiseRenderer =
                section.matches('ytd-reel-shelf-renderer, grid-shelf-view-model') ||
                Boolean(section.querySelector(SUBSCRIPTION_NOISE_CONTENT_SELECTOR));

            if (hasNoiseRenderer) {
                hideElement(section, HIDDEN_SUBSCRIPTIONS_CLASS);
            }
        });
    }

    function isWatchPage() {
        return location.pathname === '/watch';
    }

    // Parse JSON only: fetched watch pages must never execute scripts or start playback.
    function readEmbeddedJson(html, marker) {
        const match = marker.exec(html);
        if (!match) return null;
        const start = match.index + match[0].length;
        if (html[start] !== '{') return null;
        let depth = 0;
        let quoted = false;
        let escaped = false;
        for (let index = start; index < html.length; index++) {
            const char = html[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') {
                quoted = true;
            } else if (char === '{') {
                depth++;
            } else if (char === '}' && --depth === 0) {
                try { return JSON.parse(html.slice(start, index + 1)); } catch { return null; }
            }
        }
        return null;
    }

    function dataObjects(root, key) {
        const results = [];
        const pending = [root];
        while (pending.length) {
            const node = pending.pop();
            if (!node || typeof node !== 'object') continue;
            if (node[key]) results.push(node[key]);
            pending.push(...Object.values(node).filter((value) => value && typeof value === 'object'));
        }
        return results;
    }

    function collaborationConfig(html) {
        const marker = /ytcfg\.set\s*\(\s*/g;
        while (marker.lastIndex < html.length) {
            const config = readEmbeddedJson(html, marker);
            // Real pages call set('EMERGENCY_BASE_URL', ...) before the JSON config.
            // Skip non-JSON calls; a failed regex search resets lastIndex to zero.
            if (!config) {
                if (marker.lastIndex === 0) break;
                continue;
            }
            if (config.INNERTUBE_CONTEXT?.client?.clientVersion) return config;
        }
        return null;
    }

    function collaborationSessionHeaders(config) {
        const headers = {};
        if (/^\d+$/.test(String(config?.SESSION_INDEX ?? ''))) {
            headers['X-Goog-AuthUser'] = String(config.SESSION_INDEX);
        }
        if (/^\d+$/.test(config?.DELEGATED_SESSION_ID || '')) {
            headers['X-Goog-PageId'] = String(config.DELEGATED_SESSION_ID);
        }
        return headers;
    }

    function collaborationDataError(code, message, details = {}) {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        return error;
    }

    async function fetchCollaborationData(path, signal, body, headers = {}) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) controller.abort();
        const timeout = setTimeout(abort, 12000);
        try {
            const response = await fetch(path, {
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'error',
                signal: controller.signal,
                headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                ...(body ? {
                    method: 'POST',
                    body: JSON.stringify(body)
                } : {})
            });
            if (!response.ok) {
                const error = new Error('YouTube metadata request failed');
                error.status = response.status;
                error.code = 'YTC_HTTP_' + response.status;
                throw error;
            }
            return body ? await response.json() : await response.text();
        } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
        }
    }

    async function loadCollaborationSubscriptions(signal, sessionHeaders = {}) {
        const authUser = sessionHeaders['X-Goog-AuthUser'];
        const html = await fetchCollaborationData(
            '/feed/channels' + (authUser ? '?authuser=' + encodeURIComponent(authUser) : ''),
            signal, null, sessionHeaders
        );
        const data = readEmbeddedJson(html, /(?:ytInitialData|window\[\s*["']ytInitialData["']\s*\])\s*=\s*/);
        if (!data) {
            throw collaborationDataError('YTC_SUBS_DATA', 'YouTube subscription data was not found in the response');
        }
        if (data?.responseContext?.mainAppWebResponseContext?.loggedOut === true) {
            throw new Error('YouTube subscriptions unavailable');
        }
        const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        const tab = tabs.find((entry) => entry.tabRenderer?.selected)?.tabRenderer ||
            (tabs.length === 1 ? tabs[0].tabRenderer : null);
        let page = tab?.content;
        if (!page) {
            throw collaborationDataError('YTC_SUBS_CONTENT', 'The subscription content was not found', {
                tabCount: tabs.length,
                contentKeys: Object.keys(data.contents || {}).slice(0, 8)
            });
        }
        const config = collaborationConfig(html);
        const responseHeaders = collaborationSessionHeaders(config);
        for (const name of Object.keys(sessionHeaders)) {
            if (sessionHeaders[name] !== responseHeaders[name]) {
                throw new Error('YouTube account did not match the active page');
            }
        }
        sessionHeaders = responseHeaders;
        const context = config?.INNERTUBE_CONTEXT;
        const apiKey = typeof config?.INNERTUBE_API_KEY === 'string' ? config.INNERTUBE_API_KEY : '';
        const ids = new Set();
        const tokens = new Set();
        for (let count = 0; count < 100; count++) {
            if (dataObjects(page, 'nextContinuationData').length ||
                dataObjects(page, 'reloadContinuationData').length ||
                dataObjects(page, 'channelListItemViewModel').length ||
                dataObjects(page, 'lockupViewModel').some((item) => item.contentType === 'LOCKUP_CONTENT_TYPE_CHANNEL')) {
                throw collaborationDataError('YTC_SUBS_LAYOUT', 'Unsupported YouTube subscription pagination or channel format', {
                    page: count + 1,
                    hasLegacyContinuation: dataObjects(page, 'nextContinuationData').length > 0,
                    hasChannelListItems: dataObjects(page, 'channelListItemViewModel').length > 0,
                    hasChannelLockups: dataObjects(page, 'lockupViewModel').some((item) => item.contentType === 'LOCKUP_CONTENT_TYPE_CHANNEL')
                });
            }
            const channels = dataObjects(page, 'channelRenderer');
            if (!channels.length) {
                throw collaborationDataError('YTC_SUBS_CHANNELS', 'Incomplete YouTube subscription list', {
                    page: count + 1, channelsLoaded: ids.size,
                    payloadKeys: Object.keys(page || {}).slice(0, 8)
                });
            }
            for (const channel of channels) {
                if (!/^UC[\w-]{22}$/.test(channel.channelId || '')) {
                    throw new Error('Unknown YouTube channel format');
                }
                ids.add(channel.channelId);
            }
            const continuations = dataObjects(page, 'continuationItemRenderer');
            // Sort/filter menus also contain continuationCommand objects.
            // Only continuation items in the list indicate another page to fetch.
            if (!continuations.length) return ids;
            const token = continuations[0]?.continuationEndpoint?.continuationCommand?.token;
            if (continuations.length !== 1 || !token || tokens.has(token) || !context) {
                throw collaborationDataError('YTC_SUBS_PAGINATION', 'Incomplete YouTube subscription pagination', {
                    page: count + 1, channelsLoaded: ids.size,
                    continuationCount: continuations.length,
                    hasToken: Boolean(token), repeatedToken: tokens.has(token), hasContext: Boolean(context)
                });
            }
            tokens.add(token);
            const response = await fetchCollaborationData(
                '/youtubei/v1/browse' + (apiKey ? '?key=' + encodeURIComponent(apiKey) : ''),
                signal, { context, continuation: token }, sessionHeaders
            );
            if (response.responseContext?.mainAppWebResponseContext?.loggedOut === true) {
                throw new Error('YouTube session changed');
            }
            // Only the continuation payload, never sidebar or suggested channels.
            page = response.onResponseReceivedActions || response.onResponseReceivedEndpoints ||
                response.continuationContents;
        }
        throw new Error('YouTube subscription pagination limit reached');
    }

    async function lookupCollaborationUploader(videoId, signal, sessionHeaders = {}, context = null) {
        const uploaderId = (player) => {
            const details = player?.videoDetails;
            return details?.videoId === videoId && /^UC[\w-]{22}$/.test(details.channelId || '')
                ? details.channelId : null;
        };
        if (context?.client?.clientVersion) {
            try {
                // Fetch only the two IDs we need, not a complete watch page or media.
                const player = await fetchCollaborationData(
                    '/youtubei/v1/player?prettyPrint=false&fields=videoDetails(videoId,channelId)',
                    signal, { context, videoId }, sessionHeaders
                );
                const channelId = uploaderId(player);
                if (channelId) return channelId;
            } catch (error) {
                if (signal.aborted || error.status === 429 || error.status === 403) throw error;
                // Fall back to watch-page metadata for unsupported player responses.
            }
        }
        const authUser = sessionHeaders['X-Goog-AuthUser'];
        const html = await fetchCollaborationData(
            '/watch?v=' + encodeURIComponent(videoId) + (authUser ? '&authuser=' + encodeURIComponent(authUser) : ''),
            signal, null, sessionHeaders
        );
        const player = readEmbeddedJson(html, /(?:ytInitialPlayerResponse|window\[\s*["']ytInitialPlayerResponse["']\s*\])\s*=\s*/);
        return uploaderId(player);
    }

    function collaborationFilterActive() {
        return settings.enabled && settings.hideUnsubscribedCollaborations && isSubscriptionsPage();
    }

    function setCollaborationStatus(message) {
        collaborationStatus = message;
        const status = document.getElementById('ytc-collaboration-status');
        if (!status) return;
        status.hidden = !message;
        if (status.textContent !== message) status.textContent = message;
    }

    function collaborationFailureMessage(error) {
        if (error.status === 429) return 'YouTube is rate limiting checks. Try again shortly.';
        if (error.status === 401 || error.status === 403) return 'YouTube denied access to subscriptions. Reload YouTube to retry.';
        if (/account|session/i.test(error.message)) return 'Could not verify the active YouTube account. Reload YouTube to retry.';
        if (/pagination|continuation|Incomplete/i.test(error.message)) return 'The complete subscription list could not be loaded. Reload YouTube to retry.';
        if (/format/i.test(error.message)) return 'This YouTube subscription layout could not be read.';
        return 'Could not read subscriptions. Reload YouTube to retry.';
    }

    function resetCollaborationFilter() {
        collaborationRequest?.abort();
        collaborationRequest = null;
        collaborationSubscriptions = null;
        collaborationRetryAt = 0;
        collaborationUploaders.clear();
        unhideElements(HIDDEN_COLLABORATIONS_CLASS);
        setCollaborationStatus('');
    }

    function collaborationVideoId(card) {
        for (const link of queryAll('a[href]', card)) {
            try {
                const url = new URL(link.getAttribute('href'), location.href);
                const id = url.searchParams.get('v');
                if (url.origin === location.origin && url.pathname === '/watch' && /^[\w-]{11}$/.test(id || '')) {
                    return id;
                }
            } catch { /* Keep cards with unknown links visible. */ }
        }
        return '';
    }

    function hideUnsubscribedCollaborations() {
        document.documentElement.dataset.ytcHideUnsubscribedCollaborations =
            collaborationFilterActive() ? 'true' : 'false';
        if (!collaborationFilterActive()) {
            resetCollaborationFilter();
            return;
        }
        if (document.hidden) return;
        for (const [videoId, cached] of collaborationUploaders) {
            if (cached.expiresAt <= Date.now()) collaborationUploaders.delete(videoId);
        }
        const subscriptions = collaborationSubscriptions?.expiresAt > Date.now()
            ? collaborationSubscriptions.ids : null;
        const pending = new Set();
        let hasCandidates = false;
        let hiddenCount = 0;
        let unknownCount = 0;
        const selector = 'ytd-browse[page-subtype="subscriptions"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model)';
        queryAll(selector).forEach((card) => {
            // Modern lockups can be nested in rich items; classify the outer card once.
            if (card.matches('yt-lockup-view-model') && card.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer')) return;
            const videoId = card.querySelector(COLLABORATION_MARKER) ? collaborationVideoId(card) : '';
            if (videoId) hasCandidates = true;
            const cached = collaborationUploaders.get(videoId);
            const known = cached?.expiresAt > Date.now();
            const hide = Boolean(
                videoId && subscriptions && known && cached.channelId && !subscriptions.has(cached.channelId)
            );
            card.classList.toggle(HIDDEN_COLLABORATIONS_CLASS, hide);
            if (hide) hiddenCount++;
            if (videoId && known && !cached.channelId) unknownCount++;
            if (videoId && !known) pending.add(videoId);
        });
        if (!hasCandidates) {
            setCollaborationStatus('No collaboration videos detected on this page.');
            return;
        }
        if (collaborationRequest || Date.now() < collaborationRetryAt) return;
        if (subscriptions && !pending.size) {
            setCollaborationStatus(
                hiddenCount + ' collaboration videos hidden · ' + subscriptions.size + ' subscribed channels checked' +
                (unknownCount ? ' · ' + unknownCount + ' videos could not be verified' : '')
            );
            return;
        }
        const controller = new AbortController();
        collaborationRequest = controller;
        setCollaborationStatus(subscriptions ? 'Checking video uploaders…' : 'Loading your subscribed channels…');
        (async () => {
            let config = null;
            for (const script of queryAll('script:not([src])')) {
                config = collaborationConfig(script.textContent || '');
                if (config) break;
            }
            const sessionHeaders = collaborationSessionHeaders(config);
            const authUser = new URLSearchParams(location.search).get('authuser');
            if (/^\d+$/.test(authUser || '')) sessionHeaders['X-Goog-AuthUser'] = authUser;
            if (!subscriptions) {
                const ids = await loadCollaborationSubscriptions(controller.signal, sessionHeaders);
                if (controller.signal.aborted) return;
                collaborationSubscriptions = { ids, expiresAt: Date.now() + COLLABORATION_CACHE_TTL };
                setCollaborationStatus(ids.size + ' subscribed channels loaded. Checking video uploaders…');
            }
            const queue = [...pending];
            let next = 0;
            const worker = async () => {
                while (next < queue.length && !controller.signal.aborted && !document.hidden) {
                    const videoId = queue[next++];
                    let channelId = null;
                    try {
                        channelId = await lookupCollaborationUploader(videoId, controller.signal, sessionHeaders, config?.INNERTUBE_CONTEXT);
                    } catch (error) {
                        // Stop new lookups if YouTube is throttling or rejecting this session.
                        if (error.status === 429 || error.status === 403) {
                            collaborationRetryAt = Date.now() + 60000;
                            setCollaborationStatus('YouTube temporarily blocked metadata checks. Unverified videos remain visible.');
                            next = queue.length;
                        }
                    }
                    if (controller.signal.aborted) return;
                    collaborationUploaders.set(videoId, {
                        channelId,
                        expiresAt: Date.now() + (channelId ? COLLABORATION_CACHE_TTL : 60000)
                    });
                    // Update resolved cards without waiting for all metadata requests.
                    scheduleCleanup();
                }
            };
            await Promise.all([worker(), worker()]);
            reportedCleanupErrors.delete('Collaboration filter');
        })().catch((error) => {
            if (controller.signal.aborted) return;
            collaborationSubscriptions = null;
            collaborationRetryAt = Date.now() + 60000;
            setCollaborationStatus(collaborationFailureMessage(error) + (error.code ? ' [' + error.code + ']' : ''));
            if (!reportedCleanupErrors.has('Collaboration filter')) {
                reportedCleanupErrors.add('Collaboration filter');
                // Diagnostic structure only: no channel IDs, cookies, config, or continuation tokens.
                console.warn('[YouTube Cleaner] Could not verify subscriptions; collaboration videos remain visible.', {
                    code: error.code || 'YTC_SUBS_REQUEST',
                    reason: error.message,
                    ...error.details
                });
            }
        }).finally(() => {
            if (collaborationRequest !== controller) return;
            collaborationRequest = null;
            scheduleCleanup();
        });
    }

    function getCurrentVideoId() {
        if (!isWatchPage()) return '';

        return new URLSearchParams(location.search).get('v') || '';
    }

    function formatCompactNumber(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return '0';
        }

        const absolute = Math.abs(number);
        const locale = navigator.language || 'en';

        if (absolute >= 1000000) {
            return formatTruncatedCompactNumber(number, 1000000, 'M', locale);
        }

        if (absolute >= 1000) {
            return formatTruncatedCompactNumber(number, 1000, 'k', locale);
        }

        return Math.floor(number).toLocaleString(locale);
    }

    function formatTruncatedCompactNumber(value, divisor, suffix, locale) {
        const truncated = Math.trunc((value / divisor) * 10) / 10;
        const formatted = new Intl.NumberFormat(locale, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1
        }).format(truncated);

        return `${formatted} ${suffix}`;
    }

    function requestJson(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status < 200 || response.status >= 300) {
                            reject(new Error(`HTTP ${response.status}`));
                            return;
                        }

                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (error) {
                            reject(error);
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
                return;
            }

            fetch(url, {
                cache: 'force-cache',
                credentials: 'omit'
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    return response.json();
                })
                .then(resolve)
                .catch(reject);
        });
    }

    function fetchDislikeCount(videoId) {
        return requestJson(`${DISLIKE_API_URL}${encodeURIComponent(videoId)}`)
            .then((data) => Number(data && data.dislikes) || 0);
    }

    function findElement(selector, root = document) {
        return queryAll(selector, root)[0] || null;
    }

    function getButtonLabel(button) {
        return normalizeText(
            button.getAttribute('aria-label') ||
            button.getAttribute('title') ||
            button.textContent ||
            ''
        );
    }

    function findButtonByLabel(patterns, root = document) {
        return queryAll('button', root)
            .find((button) => {
                const label = getButtonLabel(button);
                return patterns.some((pattern) => pattern.test(label));
            }) || null;
    }

    function getOriginalReactionParts() {
        const segmented = findElement('segmented-like-dislike-button-view-model');
        if (segmented) {
            const buttons = queryAll('button', segmented);

            if (buttons.length >= 2) {
                return {
                    dislikeButton: buttons[1]
                };
            }
        }

        const dislikeModel = findElement('dislike-button-view-model');
        const dislikeButton = dislikeModel ? findElement('button', dislikeModel) : findButtonByLabel([/\bdislike\b/, /\bje n'aime pas\b/]);

        if (!dislikeButton) {
            return null;
        }

        return {
            dislikeButton
        };
    }

    function getDirectChildWithin(parent, descendant) {
        let node = descendant;

        while (node && node.parentElement && node.parentElement !== parent) {
            node = node.parentElement;
        }

        return node && node.parentElement === parent ? node : null;
    }

    function insertAfter(parent, node, referenceNode) {
        if (referenceNode && referenceNode.parentElement === parent) {
            parent.insertBefore(node, referenceNode.nextSibling);
            return;
        }

        parent.appendChild(node);
    }

    function setCountText(node, text, rawCount) {
        if (!node) return;

        const nextRawCount = Number(rawCount);
        const hasRawCount = Number.isFinite(nextRawCount);

        if (hasRawCount) {
            node.dataset.rawCount = String(nextRawCount);
        }

        if (node.textContent !== text) {
            node.textContent = text;
        }
    }

    function setFormattedCount(node, count) {
        const safeCount = Math.max(0, Math.round(Number(count) || 0));
        setCountText(node, formatCompactNumber(safeCount), safeCount);
    }

    function setDislikeCount(badge, count, options = {}) {
        const safeCount = Math.max(0, Math.round(Number(count) || 0));
        badge.dataset.state = 'ready';
        setFormattedCount(badge, safeCount);

        const videoId = getCurrentVideoId();
        if (videoId && options.updateCache !== false) {
            const cached = dislikeCache.get(videoId) || {};

            writeDislikeCache(videoId, {
                ...cached,
                dislikes: safeCount,
                fetchedAt: options.fetchedAt || cached.fetchedAt || Date.now()
            });
        }
    }

    function writeDislikeCache(videoId, value) {
        dislikeCache.delete(videoId);
        dislikeCache.set(videoId, value);

        while (dislikeCache.size > DISLIKE_CACHE_MAX_SIZE) {
            const oldestKey = dislikeCache.keys().next().value;
            dislikeCache.delete(oldestKey);
        }
    }

    function getReactionIcon(button) {
        return button.querySelector('.yt-spec-button-shape-next__icon') ||
            button.querySelector('yt-icon') ||
            button.querySelector('svg');
    }

    function placeCountNode(button, count, hostClass) {
        const icon = getReactionIcon(button);
        const directIcon = icon ? getDirectChildWithin(button, icon) : null;

        button.classList.add(hostClass);
        insertAfter(button, count, directIcon);
    }

    function getReactionPressedState(button) {
        const pressedElement = button.matches('[aria-pressed], [aria-checked]')
            ? button
            : button.querySelector('[aria-pressed], [aria-checked]');

        if (!pressedElement) return null;

        const value =
            pressedElement.getAttribute('aria-pressed') ||
            pressedElement.getAttribute('aria-checked') ||
            '';

        if (value === 'true') return true;
        if (value === 'false') return false;

        return null;
    }

    function getDislikePressedState(dislikeButton) {
        const nativeState = getReactionPressedState(dislikeButton);

        if (nativeState !== null) {
            dislikeButton.dataset.ytcDislikePressed = nativeState ? 'true' : 'false';
            return nativeState;
        }

        return dislikeButton.dataset.ytcDislikePressed === 'true';
    }

    function getNodeCount(node) {
        const rawCount = Number(node.dataset.rawCount);
        return Number.isFinite(rawCount) ? rawCount : null;
    }

    function updateDislikeCountFromClick(dislikeButton, badge, wasDisliked) {
        if (!settings.enabled || !settings.showDislikes || !badge.isConnected) return;

        const nativeState = getReactionPressedState(dislikeButton);
        const isDisliked = nativeState === null || nativeState === wasDisliked
            ? !wasDisliked
            : nativeState;

        dislikeButton.dataset.ytcDislikePressed = isDisliked ? 'true' : 'false';

        if (isDisliked === wasDisliked) return;

        const parsedCount = getNodeCount(badge);

        if (parsedCount !== null) {
            setDislikeCount(badge, parsedCount + (isDisliked ? 1 : -1));
        }
    }

    function wireDislikeButton(dislikeButton) {
        if (dislikeButton.dataset.ytcDislikeClickWired === 'true') return;

        dislikeButton.dataset.ytcDislikeClickWired = 'true';
        dislikeButton.dataset.ytcDislikePressed = getDislikePressedState(dislikeButton) ? 'true' : 'false';

        dislikeButton.addEventListener('click', () => {
            const wasDisliked = dislikeButton.dataset.ytcDislikePressed === 'true';
            const badge = document.getElementById('ytc-dislikes');

            if (badge) {
                updateDislikeCountFromClick(dislikeButton, badge, wasDisliked);
            }
        });
    }

    function placeDislikeCountNode(dislikeButton, count) {
        placeCountNode(dislikeButton, count, 'ytc-dislike-count-host');
        wireDislikeButton(dislikeButton);
    }

    function ensureDislikeCountNode() {
        const parts = getOriginalReactionParts();
        const dislikeButton = parts ? parts.dislikeButton : null;
        const existing = document.getElementById('ytc-dislikes');

        if (existing && dislikeButton && dislikeButton.contains(existing)) {
            placeDislikeCountNode(dislikeButton, existing);
            return existing;
        }

        if (existing) {
            existing.remove();
        }

        if (!dislikeButton) return null;

        const count = createNode('span', 'ytc-dislike-count', '...');
        count.id = 'ytc-dislikes';
        count.setAttribute('role', 'status');
        count.setAttribute('aria-live', 'polite');
        count.title = 'Return YouTube Dislike';

        placeDislikeCountNode(dislikeButton, count);
        return count;
    }

    function removeDislikeBadge() {
        const badge = document.getElementById('ytc-dislikes');
        if (badge) {
            badge.remove();
        }

        queryAll('.ytc-dislike-count-host').forEach((element) => {
            element.classList.remove('ytc-dislike-count-host');
        });

        currentDislikeVideoId = '';
    }

    function setDislikeBadgeState(badge, state, text) {
        if (!badge) return;

        badge.dataset.state = state;
        badge.textContent = text;
    }

    function updateDislikeDisplay(forceRefresh = false) {
        if (!settings.enabled || !settings.showDislikes || !isWatchPage()) {
            removeDislikeBadge();
            return;
        }

        const videoId = getCurrentVideoId();
        if (!videoId) {
            removeDislikeBadge();
            return;
        }

        const badge = ensureDislikeCountNode();
        if (!badge) return;

        const cachedDislikes = dislikeCache.get(videoId);
        const shouldUseCache =
            cachedDislikes &&
            Number.isFinite(cachedDislikes.dislikes) &&
            !forceRefresh &&
            Date.now() - cachedDislikes.fetchedAt < 60000;

        if (shouldUseCache) {
            currentDislikeVideoId = videoId;
            badge.dataset.videoId = videoId;
            setDislikeCount(badge, cachedDislikes.dislikes, {
                fetchedAt: cachedDislikes.fetchedAt
            });
            return;
        }

        if (
            !forceRefresh &&
            currentDislikeVideoId === videoId &&
            (badge.dataset.state === 'loading' || badge.dataset.state === 'error')
        ) {
            return;
        }

        const isNewVideo = badge.dataset.videoId !== videoId;

        currentDislikeVideoId = videoId;
        badge.dataset.videoId = videoId;

        if (isNewVideo) {
            delete badge.dataset.rawCount;
            setDislikeBadgeState(badge, 'loading', '...');
        } else if (!badge.dataset.rawCount) {
            setDislikeBadgeState(badge, 'loading', '...');
        } else {
            badge.dataset.state = 'loading';
        }

        const requestId = ++currentDislikeRequestId;

        fetchDislikeCount(videoId)
            .then((count) => {
                writeDislikeCache(videoId, {
                    dislikes: count,
                    fetchedAt: Date.now()
                });

                if (
                    requestId !== currentDislikeRequestId ||
                    !settings.enabled ||
                    !settings.showDislikes ||
                    getCurrentVideoId() !== videoId
                ) {
                    return;
                }

                setDislikeCount(badge, count, {
                    updateCache: false
                });
            })
            .catch(() => {
                if (requestId !== currentDislikeRequestId || getCurrentVideoId() !== videoId) {
                    return;
                }

                if (badge.dataset.rawCount) {
                    badge.dataset.state = 'ready';
                    return;
                }

                setDislikeBadgeState(badge, 'error', 'n/a');
            });
    }

    function refreshReactionCounters() {
        if (
            document.hidden ||
            !settings.enabled ||
            !settings.showDislikes ||
            !isWatchPage()
        ) {
            return;
        }

        if (Date.now() - lastDislikeRefreshAt >= 60000) {
            lastDislikeRefreshAt = Date.now();
            updateDislikeDisplay(true);
        }
    }

    function runCleanupTask(label, task) {
        try {
            task();
            reportedCleanupErrors.delete(label);
        } catch (error) {
            if (!reportedCleanupErrors.has(label)) {
                reportedCleanupErrors.add(label);
                console.warn(`[YouTube Cleaner] ${label} failed`, error);
            }
        }
    }

    function cleanPage() {
        updateWatchedVideosState();
        runCleanupTask('Collaboration filter', hideUnsubscribedCollaborations);
        runCleanupTask('Shorts redirect', redirectShortsPage);

        if (!settings.enabled) {
            runCleanupTask('disabled state cleanup', () => {
                unhideElements(HIDDEN_SHORTS_CLASS);
                unhideElements(HIDDEN_SUBSCRIPTIONS_CLASS);
                removeDislikeBadge();
            });
            return;
        }

        runCleanupTask('Shorts cleanup', () => {
            if (settings.hideShorts) {
                hideShorts();
            } else {
                unhideElements(HIDDEN_SHORTS_CLASS);
            }
        });
        runCleanupTask('Subscriptions cleanup', hideSubscriptionSections);
        runCleanupTask('Dislike display', updateDislikeDisplay);
    }

    function scheduleCleanup() {
        if (cleanupQueued) return;

        cleanupQueued = true;

        window.setTimeout(() => {
            if (document.hidden) {
                cleanupQueued = false;
                return;
            }

            requestAnimationFrame(() => {
                cleanupQueued = false;
                runCleanupTask('Settings button', ensureButton);
                cleanPage();
            });
        }, 100);
    }

    function mutationNeedsCleanup(mutations) {
        const ownedSelector = '#ytc-menu, #ytc-button-wrap, #ytc-dislikes';

        return mutations.some((mutation) => {
            if (mutation.type === 'attributes') {
                return settings.enabled && (settings.hideShorts ||
                    (collaborationFilterActive() && mutation.attributeName === 'href')) &&
                    mutation.target instanceof Element &&
                    !mutation.target.closest(ownedSelector);
            }

            const removedOwnedNode = Array.from(mutation.removedNodes).some((node) => {
                return node instanceof Element && (
                    node.matches(ownedSelector) ||
                    Boolean(node.querySelector(ownedSelector))
                );
            });

            if (removedOwnedNode) {
                return true;
            }

            return Array.from(mutation.addedNodes).some((node) => {
                if (node instanceof Element) {
                    return !node.matches(ownedSelector) && !node.closest(ownedSelector);
                }

                if (node instanceof DocumentFragment) {
                    return Boolean(node.querySelector('*'));
                }

                return false;
            });
        });
    }

    function updateWatchedVideosState() {
        // Keep History useful without changing the user's saved browsing preference.
        const isHistory = /^\/feed\/history\/?$/.test(location.pathname);
        document.documentElement.dataset.ytcWatchedVideos =
            settings.enabled && !isHistory ? settings.watchedVideosMode : 'off';
    }

    function applyState() {
        const root = document.documentElement;

        root.dataset.ytcEnabled = settings.enabled ? 'true' : 'false';
        root.dataset.ytcHideShorts =
            settings.enabled && settings.hideShorts ? 'true' : 'false';
        updateWatchedVideosState();
        root.dataset.ytcHideMixes = settings.enabled && settings.hideMixes ? 'true' : 'false';
        root.dataset.ytcHidePlayables = settings.enabled && settings.hidePlayables ? 'true' : 'false';
        root.dataset.ytcHideHomeShelves = settings.enabled && settings.hideHomeShelves ? 'true' : 'false';
        root.dataset.ytcHidePaidPromotion = settings.enabled && settings.hidePaidPromotion ? 'true' : 'false';
        root.dataset.ytcHideUpcoming =
            settings.enabled && settings.hideUpcomingVideos ? 'true' : 'false';
        root.dataset.ytcHideUnsubscribedCollaborations =
            collaborationFilterActive() ? 'true' : 'false';
        root.dataset.ytcColumns =
            settings.enabled && !settings.automaticColumns ? settings.columns : 'auto';

        updateButtonState();
        updateMenuState();

        if (!collaborationFilterActive()) resetCollaborationFilter();

        if (!settings.enabled || !settings.hideShorts) {
            unhideElements(HIDDEN_SHORTS_CLASS);
        }

        if (!settings.enabled || !settings.hideSubscriptionSections) {
            unhideElements(HIDDEN_SUBSCRIPTIONS_CLASS);
        }

        if (!settings.enabled || !settings.showDislikes) {
            removeDislikeBadge();
        }

        scheduleCleanup();
    }

    function addStyles() {
        const css = `
            .ytc-hidden-shorts,
            .ytc-hidden-subscriptions {
                display: none !important;
            }

            html[data-ytc-hide-unsubscribed-collaborations="true"] ytd-browse[page-subtype="subscriptions"] .ytc-hidden-collaboration {
                display: none !important;
            }

            html[data-ytc-hide-shorts="true"] ytd-reel-shelf-renderer,
            html[data-ytc-hide-shorts="true"] ytd-rich-shelf-renderer[is-shorts],
            html[data-ytc-hide-shorts="true"] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-guide-collapsible-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-hide-shorts="true"] yt-tab-shape[tab-title="Shorts"] {
                display: none !important;
            }

            html[data-ytc-watched-videos="hide"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model):not(ytd-browse[page-subtype="history"] *):has(:is(ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model)) {
                display: none !important;
            }

            html[data-ytc-watched-videos="dim"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model):not(ytd-browse[page-subtype="history"] *):has(:is(ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model)) {
                opacity: .5;
                transition: opacity .15s ease;
            }

            html[data-ytc-watched-videos="dim"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model):not(ytd-browse[page-subtype="history"] *):has(:is(ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model)):hover {
                opacity: 1;
            }

            html[data-ytc-hide-mixes="true"] :is(ytd-radio-renderer, ytd-compact-radio-renderer),
            html[data-ytc-hide-mixes="true"] ytd-rich-item-renderer:has(a[href$="start_radio=1"]),
            html[data-ytc-hide-mixes="true"] :is(ytd-search, #related) yt-lockup-view-model:has(a[href*="&start_radio=1&"], a[href$="&start_radio=1"]) {
                display: none !important;
            }

            html[data-ytc-hide-playables="true"] ytd-rich-shelf-renderer[is-playables],
            html[data-ytc-hide-playables="true"] :is(ytd-rich-section-renderer, ytd-rich-item-renderer, ytd-rich-shelf-renderer, grid-shelf-view-model, ytd-shelf-renderer):has(ytd-rich-shelf-renderer[is-playables], ytd-playable-tile-renderer, a[href^="/playables/"], a[href="/feed/playables"], a[href="/playables"]),
            html[data-ytc-hide-playables="true"] :is(ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-guide-collapsible-entry-renderer):has(a[href="/feed/playables"], a[href^="/playables"]) {
                display: none !important;
            }

            /* Only grouped video shelves on Home; Shorts and games have their own settings. */
            html[data-ytc-hide-home-shelves="true"] ytd-browse[page-subtype="home"] :is(ytd-rich-section-renderer, ytd-rich-shelf-renderer, grid-shelf-view-model, ytd-shelf-renderer):not([is-shorts], [is-playables]):not(:has(ytd-rich-shelf-renderer[is-shorts], ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"], ytd-rich-shelf-renderer[is-playables], ytd-playable-tile-renderer, a[href^="/playables"], a[href^="/feed/playables"])):has(ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model) {
                display: none !important;
            }

            /* Target the promotion label, keeping other preview controls and the main player intact. */
            html[data-ytc-hide-paid-promotion="true"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-thumbnail, yt-thumbnail-view-model, ytd-video-preview, #inline-player, .ytp-inline-preview-mode) :is(.ytp-paid-content-overlay, .ytmPaidContentOverlayHost, .YtmPaidContentOverlayHost, ytm-paid-content-overlay-renderer, a[href^="https://support.google.com/youtube"][href*="p=ppp"]) {
                display: none !important;
            }

            html[data-ytc-hide-upcoming="true"] ytd-browse[page-subtype="subscriptions"] :is(ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer):has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"]),
            html[data-ytc-hide-upcoming="true"] ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(lockup-attachments-view-model toggle-button-view-model) {
                display: none !important;
            }

            html[data-ytc-columns="1"] { --ytc-columns: 1; }
            html[data-ytc-columns="2"] { --ytc-columns: 2; }
            html[data-ytc-columns="3"] { --ytc-columns: 3; }
            html[data-ytc-columns="4"] { --ytc-columns: 4; }
            html[data-ytc-columns="5"] { --ytc-columns: 5; }
            html[data-ytc-columns="6"] { --ytc-columns: 6; }
            html[data-ytc-columns="7"] { --ytc-columns: 7; }
            html[data-ytc-columns="8"] { --ytc-columns: 8; }

            html[data-ytc-enabled="true"]:not([data-ytc-columns="auto"]) ytd-rich-grid-renderer {
                --ytd-rich-grid-items-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-posts-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-slim-items-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-game-cards-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-mini-game-cards-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-item-max-width: none !important;
                --ytd-rich-grid-item-min-width: 0 !important;
            }

            html[data-ytc-enabled="true"]:not([data-ytc-columns="auto"]) ytd-rich-grid-renderer #contents > ytd-rich-item-renderer,
            html[data-ytc-enabled="true"]:not([data-ytc-columns="auto"]) ytd-rich-grid-row #contents > ytd-rich-item-renderer {
                width: calc((100% / var(--ytc-columns)) - 16px) !important;
                max-width: none !important;
                min-width: 0 !important;
                flex: 0 0 calc((100% / var(--ytc-columns)) - 16px) !important;
            }

            #ytc-button-wrap {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                margin: 0 4px;
                position: relative;
                z-index: 2147483646;
            }

            #ytc-button {
                width: 40px;
                height: 40px;
                border: 0;
                border-radius: 50%;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                color: #0f0f0f;
                padding: 0;
                margin: 0;
                user-select: none;
            }

            html[dark] #ytc-button {
                color: #f1f1f1;
            }

            #ytc-button:hover {
                background: rgba(0, 0, 0, .08);
            }

            #ytc-button:focus-visible,
            #ytc-menu button:focus-visible,
            #ytc-menu input:focus-visible {
                outline: 2px solid #3ea6ff;
                outline-offset: 2px;
            }

            html[dark] #ytc-button:hover {
                background: rgba(255, 255, 255, .10);
            }

            #ytc-button[data-active="false"] {
                opacity: .45;
            }

            #ytc-button svg {
                width: 24px;
                height: 24px;
                display: block;
                fill: none;
                stroke: currentColor;
                stroke-width: 2;
                stroke-linecap: round;
                stroke-linejoin: round;
                pointer-events: none;
            }

            #ytc-button svg * {
                pointer-events: none;
            }

            #ytc-menu {
                --ytc-surface: #fff;
                --ytc-text: #171717;
                --ytc-muted: #666;
                --ytc-line: #e8e8e8;
                --ytc-hover: #f5f5f5;
                --ytc-accent: #e53945;
                --ytc-lab: #95651c;
                --ytc-switch-off: #aaa;
                color-scheme: light;
                position: fixed;
                top: 58px;
                right: 12px;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                width: 420px;
                max-width: calc(100vw - 24px);
                max-height: calc(100dvh - 80px);
                overflow: hidden;
                padding: 0;
                border-radius: 12px;
                background: var(--ytc-surface) !important;
                color: var(--ytc-text) !important;
                box-shadow: 0 12px 36px rgba(0, 0, 0, .22), 0 2px 6px rgba(0, 0, 0, .08);
                border: 1px solid var(--ytc-line);
                font-family: Roboto, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.4;
                opacity: 1 !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                isolation: isolate;
            }

            html[dark] #ytc-menu {
                --ytc-surface: #212121;
                --ytc-text: #f1f1f1;
                --ytc-muted: #aaa;
                --ytc-line: #383838;
                --ytc-hover: #292929;
                --ytc-accent: #ff5a62;
                --ytc-lab: #d5ae6b;
                --ytc-switch-off: #666;
                color-scheme: dark;
                box-shadow: 0 14px 40px rgba(0, 0, 0, .45);
            }

            #ytc-menu[hidden],
            #ytc-menu [hidden] {
                display: none !important;
            }

            #ytc-menu,
            #ytc-menu * {
                box-sizing: border-box;
            }

            #ytc-menu .ytc-menu-header {
                flex: 0 0 auto;
                padding: 18px 20px 0;
            }

            #ytc-menu .ytc-brand {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            #ytc-menu .ytc-brand-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                color: var(--ytc-accent);
            }

            #ytc-menu .ytc-brand-icon svg {
                width: 28px;
                height: 28px;
            }

            #ytc-menu .ytc-title {
                font-size: 18px;
                font-weight: 600;
                letter-spacing: -.3px;
                color: inherit;
            }

            #ytc-menu .ytc-close {
                display: grid;
                place-items: center;
                width: 30px;
                height: 30px;
                margin-left: auto;
                border: 0;
                padding: 0;
                border-radius: 6px;
                background: transparent;
                color: var(--ytc-muted);
                cursor: pointer;
            }

            #ytc-menu .ytc-close:hover {
                background: var(--ytc-hover);
                color: var(--ytc-text);
            }

            #ytc-menu .ytc-close svg {
                width: 18px;
                height: 18px;
            }

            #ytc-menu .ytc-master.ytc-row {
                align-items: center;
                margin: 14px 0 10px;
                padding: 10px 12px;
                background: var(--ytc-hover);
                border: 1px solid var(--ytc-line);
                border-radius: 8px;
            }

            #ytc-menu .ytc-master .ytc-help {
                font-size: 11px;
                margin-top: 1px;
            }

            #ytc-menu .ytc-tabs {
                display: flex;
                flex: 0 0 auto;
                gap: 22px;
                padding: 0 20px;
                border-bottom: 1px solid var(--ytc-line);
            }

            #ytc-menu .ytc-tab {
                position: relative;
                padding: 13px 0 11px;
                border: 0;
                background: transparent;
                color: var(--ytc-muted);
                font: inherit;
                font-weight: 500;
                cursor: pointer;
            }

            #ytc-menu .ytc-tab:hover,
            #ytc-menu .ytc-tab[aria-selected="true"] {
                color: var(--ytc-text);
            }

            #ytc-menu .ytc-tab[aria-selected="true"]::after {
                position: absolute;
                content: "";
                bottom: -1px;
                height: 2px;
                left: 0;
                right: 0;
                background: var(--ytc-accent);
            }

            #ytc-menu .ytc-menu-body {
                min-height: 0;
                overflow-y: auto;
                overscroll-behavior: contain;
                scrollbar-width: thin;
                padding: 0 20px;
            }

            #ytc-menu .ytc-section {
                padding: 14px 0 8px;
                border-top: 1px solid var(--ytc-line);
            }

            #ytc-menu .ytc-section:first-child {
                border-top: 0;
            }

            #ytc-menu .ytc-section-title {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--ytc-muted);
                margin-bottom: 3px;
            }

            #ytc-menu .ytc-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin: 0;
                padding: 11px 0;
            }

            #ytc-menu .ytc-row > div:first-child {
                min-width: 0;
            }

            #ytc-menu .ytc-label {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 13px;
                font-weight: 500;
                line-height: 1.4;
                color: inherit;
            }

            #ytc-menu .ytc-help {
                font-size: 12px;
                line-height: 1.45;
                margin-top: 3px;
                color: var(--ytc-muted);
            }

            #ytc-menu #ytc-collaboration-status {
                border-left: 2px solid var(--ytc-line);
                padding-left: 8px;
                margin-top: 9px;
                font-size: 11px;
                overflow-wrap: anywhere;
            }

            #ytc-menu .ytc-experimental {
                display: inline-flex;
                flex: 0 0 auto;
                align-items: center;
                color: var(--ytc-lab);
                cursor: help;
            }

            #ytc-menu .ytc-experimental svg {
                display: block;
                width: 15px;
                height: 15px;
            }

            #ytc-menu .ytc-switch {
                width: 38px;
                height: 22px;
                margin: 1px 0 0;
                border-radius: 11px;
                border: 0;
                cursor: pointer;
                background: var(--ytc-switch-off) !important;
                position: relative;
                flex: 0 0 auto;
                padding: 0;
            }

            #ytc-menu .ytc-switch::after {
                content: "";
                position: absolute;
                width: 16px;
                height: 16px;
                top: 3px;
                left: 3px;
                border-radius: 50%;
                background: #ffffff;
                box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
                transition: transform .15s ease;
            }

            #ytc-menu .ytc-switch[data-active="true"] {
                background: var(--ytc-accent) !important;
            }

            #ytc-menu .ytc-switch[data-active="true"]::after {
                transform: translateX(16px);
                background: #ffffff;
            }

            #ytc-menu .ytc-master .ytc-switch {
                width: 44px;
                height: 24px;
                border-radius: 12px;
                margin: 0;
            }

            #ytc-menu .ytc-master .ytc-switch::after {
                width: 18px;
                height: 18px;
            }

            #ytc-menu .ytc-master .ytc-switch[data-active="true"]::after {
                transform: translateX(20px);
            }

            #ytc-menu .ytc-switch:disabled {
                cursor: not-allowed;
                opacity: .45;
            }

            #ytc-menu .ytc-slider-wrap {
                margin: 0;
                padding: 12px 0;
            }

            #ytc-menu .ytc-slider-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 4px;
            }

            #ytc-menu .ytc-slider-value {
                font-size: 12px;
                font-weight: 500;
                color: var(--ytc-text);
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }

            #ytc-menu .ytc-slider {
                width: 100%;
                margin: 12px 0 4px;
                accent-color: var(--ytc-accent);
                cursor: pointer;
            }

            #ytc-menu .ytc-slider:disabled {
                cursor: not-allowed;
                opacity: .45;
            }

            #ytc-menu .ytc-slider-scale {
                display: flex;
                justify-content: space-between;
                margin-top: 2px;
                font-size: 11px;
                color: var(--ytc-muted);
            }

            @media (prefers-reduced-motion: reduce) {
                #ytc-menu .ytc-switch::after { transition: none; }
            }

            .ytc-dislike-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                align-self: center;
                min-width: max-content;
                height: 20px;
                flex: 0 0 auto;
                font-family: Roboto, Arial, sans-serif;
                font-weight: 500;
                font-size: 14px;
                line-height: 20px;
                color: inherit;
                pointer-events: none;
                white-space: nowrap;
            }

            .ytc-dislike-count-host {
                display: inline-flex !important;
                align-items: center !important;
                flex-direction: row !important;
                gap: 6px !important;
                min-width: max-content !important;
                max-width: none !important;
                width: auto !important;
                overflow: visible !important;
            }

            segmented-like-dislike-button-view-model:has(#ytc-dislikes) {
                display: inline-flex !important;
                min-width: max-content !important;
                max-width: none !important;
                width: auto !important;
                overflow: visible !important;
            }

        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }

        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.appendChild(style);
    }

    function createNode(tag, className, text) {
        const node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined && text !== null) {
            node.textContent = text;
        }

        return node;
    }

    function createSvgElement(tag, attrs = {}) {
        const namespace = 'http://www.w3.org/2000/svg';
        const node = document.createElementNS(namespace, tag);

        Object.entries(attrs).forEach(([key, value]) => {
            node.setAttribute(key, value);
        });

        return node;
    }

    function createCleanerIcon() {
        const svg = createSvgElement('svg', {
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: 'lucide lucide-brush-cleaning-icon lucide-brush-cleaning',
            'aria-hidden': 'true',
            focusable: 'false'
        });

        svg.appendChild(createSvgElement('path', {
            d: 'm16 22-1-4'
        }));
        svg.appendChild(createSvgElement('path', {
            d: 'M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1'
        }));
        svg.appendChild(createSvgElement('path', {
            d: 'M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z'
        }));
        svg.appendChild(createSvgElement('path', {
            d: 'm8 22 1-4'
        }));

        return svg;
    }

    function createSection(title, ...children) {
        const section = createNode('div', 'ytc-section');
        section.appendChild(createNode('div', 'ytc-section-title', title));

        children.forEach((child) => {
            if (child) {
                section.appendChild(child);
            }
        });

        return section;
    }

    function createFlaskIcon() {
        const svg = createSvgElement('svg', {
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            'aria-hidden': 'true', focusable: 'false'
        });
        svg.appendChild(createSvgElement('path', {
            d: 'M9 3h6M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3M8 15h8'
        }));
        return svg;
    }

    function createSwitchRow(title, help, settingKey) {
        const row = createNode('div', 'ytc-row');
        const textWrap = document.createElement('div');

        const label = createNode('div', 'ytc-label', title);
        const helpText = createNode('div', 'ytc-help', help);
        helpText.id = 'ytc-help-' + settingKey;
        const experimental = EXPERIMENTAL_SETTINGS[settingKey];
        if (experimental) {
            const badge = createNode('span', 'ytc-experimental');
            badge.id = 'ytc-experimental-' + settingKey;
            badge.title = 'Experimental: ' + experimental;
            badge.setAttribute('role', 'img');
            badge.setAttribute('aria-label', badge.title);
            badge.appendChild(createFlaskIcon());
            label.appendChild(badge);
        }

        const button = createNode('button', 'ytc-switch');
        button.type = 'button';
        button.dataset.setting = settingKey;
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-label', title);
        button.setAttribute('aria-describedby', helpText.id + (experimental ? ' ytc-experimental-' + settingKey : ''));

        button.addEventListener('click', (event) => {
            event.stopPropagation();
            settings[settingKey] = !settings[settingKey];
            saveSettings();
        });

        textWrap.appendChild(label);
        textWrap.appendChild(helpText);

        row.appendChild(textWrap);
        row.appendChild(button);

        return row;
    }

    function createCollaborationSwitchRow() {
        const row = createSwitchRow(
            'Only subscribed uploaders',
            'Hide collaborations from unfollowed uploaders; reads subscriptions on YouTube',
            'hideUnsubscribedCollaborations'
        );
        const status = createNode('div', 'ytc-help', collaborationStatus);
        status.id = 'ytc-collaboration-status';
        status.hidden = !collaborationStatus;
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        row.firstElementChild.appendChild(status);
        return row;
    }

    function createWatchedModeSlider() {
        const wrap = createNode('div', 'ytc-slider-wrap');
        const head = createNode('div', 'ytc-slider-head');
        const label = createNode('div', 'ytc-label', 'Watched videos');
        const value = createNode('div', 'ytc-slider-value');
        value.id = 'ytc-watched-mode-value';

        const help = createNode('div', 'ytc-help', 'Based on thumbnail watch progress; never applied to History');
        help.id = 'ytc-watched-help';
        const slider = createNode('input', 'ytc-slider');
        slider.id = 'ytc-watched-mode-slider';
        slider.type = 'range';
        slider.min = '0';
        slider.max = '2';
        slider.step = '1';
        slider.setAttribute('aria-label', 'Watched videos');
        slider.setAttribute('aria-describedby', help.id);
        slider.value = String(WATCHED_VIDEO_MODES.indexOf(settings.watchedVideosMode));
        slider.setAttribute('aria-valuetext', WATCHED_VIDEO_MODE_LABELS[Number(slider.value)]);
        value.textContent = WATCHED_VIDEO_MODE_LABELS[Number(slider.value)];

        slider.addEventListener('input', (event) => {
            event.stopPropagation();
            if (!(event.target instanceof HTMLInputElement)) return;

            const index = Number(event.target.value);
            const mode = WATCHED_VIDEO_MODES[index];
            if (!mode) return;

            settings.watchedVideosMode = mode;
            event.target.setAttribute('aria-valuetext', WATCHED_VIDEO_MODE_LABELS[index]);
            value.textContent = WATCHED_VIDEO_MODE_LABELS[index];
            saveSettings();
        });

        const scale = createNode('div', 'ytc-slider-scale');
        WATCHED_VIDEO_MODE_LABELS.forEach((modeLabel) => {
            scale.appendChild(createNode('span', null, modeLabel));
        });

        head.appendChild(label);
        head.appendChild(value);
        wrap.appendChild(head);
        wrap.appendChild(help);
        wrap.appendChild(slider);
        wrap.appendChild(scale);

        return wrap;
    }

    function createColumnSlider() {
        const wrap = createNode('div', 'ytc-slider-wrap');
        const head = createNode('div', 'ytc-slider-head');
        const label = createNode('div', 'ytc-label', 'Manual columns');
        const value = createNode('div', 'ytc-slider-value');
        value.id = 'ytc-column-value';

        const slider = createNode('input', 'ytc-slider');
        slider.id = 'ytc-column-slider';
        slider.type = 'range';
        slider.min = '1';
        slider.max = '8';
        slider.step = '1';
        slider.value = settings.columns;
        slider.setAttribute('aria-label', 'Videos per row');
        slider.setAttribute('aria-valuetext', settings.columns + ' videos per row');

        slider.addEventListener('input', (event) => {
            event.stopPropagation();
            if (!(event.target instanceof HTMLInputElement)) return;

            const nextValue = event.target.value;
            if (!VALID_COLUMNS.includes(nextValue)) return;

            settings.columns = nextValue;
            settings.automaticColumns = false;
            saveSettings();
        });

        const scale = createNode('div', 'ytc-slider-scale');
        scale.appendChild(createNode('span', null, '1'));
        scale.appendChild(createNode('span', null, '8'));

        head.appendChild(label);
        head.appendChild(value);
        wrap.appendChild(head);
        wrap.appendChild(slider);
        wrap.appendChild(scale);

        return wrap;
    }

    function createColumnsAutoRow() {
        return createSwitchRow(
            'Automatic grid',
            'Use YouTube default responsive columns',
            'automaticColumns'
        );
    }

    function ensureButton() {
        if (!document.body) return;
        if (document.getElementById('ytc-button-wrap')) {
            ensureMenu();
            updateButtonState();
            return;
        }

        const host =
            document.querySelector('ytd-masthead #end #buttons') ||
            document.querySelector('ytd-masthead #end') ||
            document.querySelector('#end');

        if (!host) return;

        const wrap = createNode('div');
        wrap.id = 'ytc-button-wrap';

        const button = createNode('button');
        button.id = 'ytc-button';
        button.type = 'button';
        button.title = 'YouTube Cleaner';
        button.setAttribute('aria-label', 'YouTube Cleaner');
        button.setAttribute('aria-controls', 'ytc-menu');
        button.setAttribute('aria-expanded', 'false');
        button.appendChild(createCleanerIcon());

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMenu();
        });

        wrap.appendChild(button);

        const notifications = host.querySelector(
            'ytd-notification-topbar-button-renderer, button[aria-label*="Notifications"], button[aria-label*="notifications"]'
        );

        if (notifications && notifications.parentElement === host) {
            host.insertBefore(wrap, notifications);
        } else {
            host.appendChild(wrap);
        }

        ensureMenu();
        updateButtonState();
    }

    function ensureMenu() {
        if (!document.body) return;
        if (document.getElementById('ytc-menu')) return;

        const menu = createNode('div');
        menu.id = 'ytc-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', 'YouTube Cleaner settings');

        const header = createNode('div', 'ytc-menu-header');
        const brand = createNode('div', 'ytc-brand');
        const logo = createNode('div', 'ytc-brand-icon');
        logo.appendChild(createCleanerIcon());
        const brandText = createNode('div');
        const title = createNode('div', 'ytc-title', 'YouTube Cleaner');
        title.setAttribute('role', 'heading');
        title.setAttribute('aria-level', '2');
        brandText.appendChild(title);
        const close = createNode('button', 'ytc-close');
        close.type = 'button';
        close.title = 'Close (Esc)';
        close.setAttribute('aria-label', 'Close settings');
        const closeIcon = createSvgElement('svg', {
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            'stroke-width': '1.8', 'stroke-linecap': 'round', 'aria-hidden': 'true'
        });
        closeIcon.appendChild(createSvgElement('path', { d: 'm6 6 12 12M6 18 18 6' }));
        close.appendChild(closeIcon);
        close.addEventListener('click', () => closeMenu(true));
        brand.appendChild(logo);
        brand.appendChild(brandText);
        brand.appendChild(close);
        header.appendChild(brand);
        const master = createSwitchRow('Cleaner', settings.enabled ? 'Active' : 'Paused', 'enabled');
        master.classList.add('ytc-master');
        header.appendChild(master);

        const videoSection = createSection(
            'Videos',
            createSwitchRow(
                'Hide Shorts',
                'Remove Shorts from feeds, sidebar, and direct links',
                'hideShorts'
            ),
            createWatchedModeSlider(),
            createSwitchRow(
                'Hide YouTube Mixes',
                'Keep regular playlists, remove auto-generated Mixes',
                'hideMixes'
            )
        );
        const interfaceSection = createSection(
            'Interface',
            createSwitchRow(
                'Hide YouTube games',
                'Remove Playables shelves and sidebar entries',
                'hidePlayables'
            ),
            createSwitchRow(
                'Hide home shelves',
                'Remove grouped picks, including music selections',
                'hideHomeShelves'
            ),
            createSwitchRow(
                'Hide promotion labels',
                'Remove paid-promotion banners from thumbnail previews',
                'hidePaidPromotion'
            )
        );

        const subscriptionsSection = createSection(
            'Subscriptions',
            createSwitchRow(
                'Hide noisy sections',
                'Remove recommended and most relevant blocks',
                'hideSubscriptionSections'
            ),
            createSwitchRow(
                'Hide upcoming videos',
                'Remove scheduled premieres and streams until they start',
                'hideUpcomingVideos'
            ),
            createCollaborationSwitchRow()
        );

        const layoutSection = createSection(
            'Grid',
            createColumnsAutoRow(),
            createColumnSlider()
        );

        const extrasSection = createSection(
            'Extras',
            createSwitchRow(
                'Show dislikes',
                'Display Return YouTube Dislike counts on watch pages',
                'showDislikes'
            )
        );

        const tabs = createNode('div', 'ytc-tabs');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Settings sections');
        const body = createNode('div', 'ytc-menu-body');
        const groups = [
            { id: 'videos', title: 'Videos', sections: [videoSection, interfaceSection] },
            { id: 'subscriptions', title: 'Subscriptions', sections: [subscriptionsSection] },
            { id: 'layout', title: 'Layout', sections: [layoutSection, extrasSection] }
        ];
        groups.forEach((group, index) => {
            const tab = createNode('button', 'ytc-tab', group.title);
            tab.type = 'button';
            tab.id = 'ytc-tab-' + group.id;
            tab.dataset.tab = group.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', 'ytc-panel-' + group.id);
            tab.setAttribute('aria-selected', currentMenuTab === group.id ? 'true' : 'false');
            tab.tabIndex = currentMenuTab === group.id ? 0 : -1;
            tab.addEventListener('click', () => activateMenuTab(group.id));
            tab.addEventListener('keydown', (event) => {
                let next;
                if (event.key === 'ArrowRight') next = (index + 1) % groups.length;
                if (event.key === 'ArrowLeft') next = (index + groups.length - 1) % groups.length;
                if (event.key === 'Home') next = 0;
                if (event.key === 'End') next = groups.length - 1;
                if (next === undefined) return;
                event.preventDefault();
                event.stopPropagation();
                activateMenuTab(groups[next].id, true);
            });
            tabs.appendChild(tab);
            const panel = createNode('div', 'ytc-panel');
            panel.id = 'ytc-panel-' + group.id;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id);
            panel.hidden = currentMenuTab !== group.id;
            group.sections.forEach((section) => panel.appendChild(section));
            body.appendChild(panel);
        });
        menu.appendChild(header);
        menu.appendChild(tabs);
        menu.appendChild(body);

        document.body.appendChild(menu);

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;

            const clickedButton = event.target.closest('#ytc-button-wrap');
            const clickedMenu = event.target.closest('#ytc-menu');

            if (!clickedButton && !clickedMenu) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || menu.hidden) return;

            closeMenu(true);
        });

        updateMenuState();
    }

    function activateMenuTab(tabId, focus = false) {
        const menu = document.getElementById('ytc-menu');
        const tab = menu?.querySelector('#ytc-tab-' + tabId);
        if (!tab) return;
        const changed = currentMenuTab !== tabId;
        currentMenuTab = tabId;
        menu.querySelectorAll('.ytc-tab').forEach((button) => {
            const selected = button === tab;
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
            button.tabIndex = selected ? 0 : -1;
        });
        menu.querySelectorAll('.ytc-panel').forEach((panel) => {
            panel.hidden = panel.id !== 'ytc-panel-' + tabId;
        });
        if (changed) menu.querySelector('.ytc-menu-body').scrollTop = 0;
        if (focus) tab.focus({ preventScroll: true });
        positionMenu();
    }

    function closeMenu(returnFocus = false) {
        const menu = document.getElementById('ytc-menu');
        if (!menu) return;
        menu.hidden = true;
        updateMenuExpandedState();
        if (returnFocus) document.getElementById('ytc-button')?.focus({ preventScroll: true });
    }

    function positionMenu() {
        const button = document.getElementById('ytc-button');
        const menu = document.getElementById('ytc-menu');

        if (!button || !menu || menu.hidden) return;

        const rect = button.getBoundingClientRect();
        const margin = 12;

        let top = Math.max(margin, Math.round(rect.bottom + 10));
        let right = Math.round(window.innerWidth - rect.right);
        const menuWidth = menu.offsetWidth || 420;
        right = Math.max(margin, Math.min(right, window.innerWidth - menuWidth - margin));
        if (window.innerHeight - top - margin < 240) top = margin;
        menu.style.maxHeight = Math.max(0, window.innerHeight - top - margin) + 'px';

        menu.style.top = `${top}px`;
        menu.style.right = `${right}px`;
    }

    function toggleMenu() {
        ensureMenu();

        const menu = document.getElementById('ytc-menu');
        if (!menu) return;

        menu.hidden = !menu.hidden;

        updateMenuState();
        updateMenuExpandedState();

        if (!menu.hidden) {
            activateMenuTab(currentMenuTab);
            menu.querySelector('.ytc-tab[aria-selected="true"]')?.focus({ preventScroll: true });
            positionMenu();
            requestAnimationFrame(positionMenu);
        }
    }

    function updateButtonState() {
        const button = document.getElementById('ytc-button');
        if (!button) return;

        button.dataset.active = settings.enabled ? 'true' : 'false';
    }

    function updateMenuExpandedState() {
        const button = document.getElementById('ytc-button');
        const menu = document.getElementById('ytc-menu');

        if (button) {
            button.setAttribute('aria-expanded', menu && !menu.hidden ? 'true' : 'false');
        }
    }

    function updateMenuState() {
        const menu = document.getElementById('ytc-menu');
        if (!menu) return;

        const masterState = menu.querySelector('#ytc-help-enabled');
        if (masterState) masterState.textContent = settings.enabled ? 'Active' : 'Paused';

        menu.querySelectorAll('.ytc-switch[data-setting]').forEach((button) => {
            const settingKey = button.dataset.setting;
            const isActive = Boolean(settings[settingKey]);

            button.dataset.active = isActive ? 'true' : 'false';
            button.setAttribute('aria-checked', isActive ? 'true' : 'false');
            button.removeAttribute('aria-pressed');
            button.disabled = false;
            button.setAttribute('aria-disabled', 'false');
        });

        const watchedSlider = menu.querySelector('#ytc-watched-mode-slider');
        const watchedValue = menu.querySelector('#ytc-watched-mode-value');
        const watchedIndex = WATCHED_VIDEO_MODES.indexOf(settings.watchedVideosMode);
        const watchedLabel = WATCHED_VIDEO_MODE_LABELS[watchedIndex];

        if (watchedSlider) {
            watchedSlider.value = String(watchedIndex);
            watchedSlider.setAttribute('aria-valuetext', watchedLabel);
        }

        if (watchedValue) {
            watchedValue.textContent = watchedLabel;
        }

        const slider = menu.querySelector('#ytc-column-slider');
        const value = menu.querySelector('#ytc-column-value');

        if (slider) {
            slider.value = settings.columns;
            slider.disabled = settings.automaticColumns;
            slider.setAttribute('aria-valuetext', settings.columns + ' videos per row');
        }

        if (value) {
            value.textContent = settings.automaticColumns ? 'Auto' : `${settings.columns} per row`;
        }
    }

    function start() {
        if (started) return;
        started = true;

        redirectShortsPage();
        addStyles();
        applyState();

        const observer = new MutationObserver((mutations) => {
            if (mutationNeedsCleanup(mutations)) {
                scheduleCleanup();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'overlay-style', 'is-shorts']
        });

        ['yt-navigate-finish', 'yt-page-data-updated', 'popstate'].forEach((eventName) => {
            window.addEventListener(eventName, () => {
                updateWatchedVideosState();
                document.documentElement.dataset.ytcHideUnsubscribedCollaborations =
                    collaborationFilterActive() ? 'true' : 'false';
                if (eventName === 'yt-navigate-finish' || !collaborationFilterActive()) resetCollaborationFilter();
                scheduleCleanup();
            });
        });
        window.addEventListener('load', scheduleCleanup);
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                scheduleCleanup();
                refreshReactionCounters();
            }
        });
        window.addEventListener('storage', (event) => {
            if (event.key !== STORAGE_KEY) return;

            settings = loadSettings();
            applyState();
        });

        document.addEventListener('DOMContentLoaded', scheduleCleanup);

        setInterval(refreshReactionCounters, 60000);
    }

    start();
})();
