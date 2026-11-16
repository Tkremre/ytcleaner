// ==UserScript==
// @name         YouTube Cleaner - Hide Shorts & Clean Layout
// @name:fr      YouTube Cleaner - Masquer les Shorts et nettoyer l'interface
// @namespace    https://github.com/Tkremre/ytcleaner
// @version      1.5.0
// @description  Hide the parts you skip, adjust the layout, and keep the video in view. A few useful settings for YouTube on desktop.
// @description:fr Retirez ce qui vous encombre, réglez l’affichage et gardez la vidéo sous les yeux. Quelques réglages utiles pour YouTube sur ordinateur.
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
    const FLOATING_LAYOUT_KEY = 'yt_cleaner_floating_layout_v1';
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
        hideSearchSections: false,
        hideEndCards: false,
        hideMembersOnly: false,
        filterVideoTitles: false,
        blockedTitleKeywords: '',
        keywordFilterPages: ['home', 'subscriptions'],
        hideSubscriptionSections: true,
        hideUpcomingVideos: false,
        hideUnsubscribedCollaborations: false,
        floatingPlayer: false,
        scrollRecommendations: false,
        showDislikes: false
    };

    const VALID_COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const WATCHED_VIDEO_MODES = ['off', 'dim', 'hide'];
    const WATCHED_VIDEO_MODE_LABELS = ['Off', 'Dim', 'Hide'];
    const EXPERIMENTAL_SETTINGS = {
        hideHomeShelves: 'Grouped recommendations vary between YouTube layouts.',
        hideUpcomingVideos: 'Upcoming-video indicators can vary between YouTube layouts.',
        hideUnsubscribedCollaborations: 'Uses YouTube subscription and uploader metadata that can change.',
        floatingPlayer: 'Uses the desktop watch-page player layout, which YouTube can change.',
        scrollRecommendations: 'Uses the desktop two-column sidebar. Theater, narrow windows, and sidebars with other panels stay unchanged.',
        hideSearchSections: 'Recognizes recommendation headings in English and French; unknown sections stay visible.',
        hideMembersOnly: 'Relies on YouTube membership badges; unmarked videos stay visible.'
    };
    const VIDEO_CARD_SELECTOR = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model';
    const KEYWORD_PAGE_LABELS = {
        home: 'Home', subscriptions: 'Subscriptions', search: 'Search',
        related: 'Related videos', channels: 'Channel pages'
    };
    const SEARCH_NOISE_TITLES = new Set([
        'People also watched', 'For you', 'Previously watched', 'Explore more',
        'Related to your search', 'From related searches', 'People also search for', 'Channels new to you',
        "D’autres personnes ont également regardé", "D’autres personnes ont aussi regardé",
        "D’autres personnes ont regardé", 'Les internautes ont également regardé',
        'Les internautes ont aussi regardé', 'Les internautes regardent aussi', 'Pour vous',
        'Déjà regardées', 'Vidéos déjà regardées', 'Déjà visionnées', 'Explorer davantage',
        'Explorer plus', 'Recherches associées', 'Les internautes recherchent aussi',
        'En rapport avec votre recherche'
    ].map(normalizeText));
    const HIDDEN_SEARCH_CLASS = 'ytc-hidden-search-section';
    const HIDDEN_KEYWORD_CLASS = 'ytc-hidden-title';
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
    let currentMenuTab = 'browse';
    const menuTabScrollPositions = new Map();
    const collaborationUploaders = new Map();
    let floatingPlayer = null;
    let floatingFrameQueued = false;
    let floatingNavigation = false;
    let floatingLayout = loadFloatingLayout();
    let recommendationsPane = null;
    let recommendationsFrameQueued = false;
    let titleKeywordSource = null;
    let titleKeywords = [];

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
            loaded.floatingPlayer = typeof loaded.floatingPlayer === 'boolean'
                ? loaded.floatingPlayer
                : DEFAULTS.floatingPlayer;
            ['hideSearchSections', 'hideEndCards', 'hideMembersOnly', 'filterVideoTitles', 'scrollRecommendations'].forEach((key) => {
                loaded[key] = typeof loaded[key] === 'boolean' ? loaded[key] : DEFAULTS[key];
            });
            loaded.blockedTitleKeywords = typeof loaded.blockedTitleKeywords === 'string'
                ? loaded.blockedTitleKeywords.slice(0, 10000) : '';
            loaded.keywordFilterPages = Array.isArray(loaded.keywordFilterPages)
                ? [...new Set(loaded.keywordFilterPages.filter((page) => typeof page === 'string' && Object.hasOwn(KEYWORD_PAGE_LABELS, page)))]
                : [...DEFAULTS.keywordFilterPages];

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

    function parseTitleKeywords(value) {
        return [...new Set(String(value).split(/\r?\n/).map(normalizeText).filter(Boolean))];
    }

    function keywordFilterRoot() {
        const pages = settings.keywordFilterPages;
        let selector = '';
        if (location.pathname === '/' && pages.includes('home')) {
            selector = 'ytd-browse[page-subtype="home"]:not([hidden])';
        } else if (isSubscriptionsPage() && pages.includes('subscriptions')) {
            selector = 'ytd-browse[page-subtype="subscriptions"]:not([hidden])';
        } else if (location.pathname === '/results' && pages.includes('search')) {
            selector = 'ytd-search:not([hidden])';
        } else if (isWatchPage() && pages.includes('related')) {
            selector = 'ytd-watch-flexy:not([hidden]) #related';
        } else if (/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(?:\/|$)/.test(location.pathname) && pages.includes('channels')) {
            selector = 'ytd-browse[page-subtype="channels"]:not([hidden])';
        }
        return selector ? document.querySelector(selector) : null;
    }

    function filterVideoTitles() {
        if (!settings.enabled || !settings.filterVideoTitles) {
            unhideElements(HIDDEN_KEYWORD_CLASS);
            return;
        }
        if (titleKeywordSource !== settings.blockedTitleKeywords) {
            titleKeywordSource = settings.blockedTitleKeywords;
            titleKeywords = parseTitleKeywords(titleKeywordSource);
        }
        const root = titleKeywords.length ? keywordFilterRoot() : null;
        const hidden = new Set();
        if (root) {
            queryAll(VIDEO_CARD_SELECTOR, root).forEach((card) => {
                // Hide the outer card, not an inner lockup that would leave an empty grid slot.
                if (card.parentElement?.closest(VIDEO_CARD_SELECTOR)) return;
                const title = card.querySelector('#video-title, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title, h3 a[href^="/watch"], h3 a[href^="/shorts/"]');
                const link = title?.closest('a[href]') || title?.querySelector('a[href]');
                if (!link) return;
                let url;
                try {
                    url = new URL(link.getAttribute('href'), location.href);
                } catch {
                    return;
                }
                // Modern lockups also represent playlists and channels, not just videos.
                if (url.origin !== location.origin || !(url.pathname === '/watch' || url.pathname.startsWith('/shorts/'))) return;
                const text = normalizeText(title?.getAttribute('title') || title?.textContent);
                if (text && titleKeywords.some((keyword) => text.includes(keyword))) hidden.add(card);
            });
        }
        Array.from(document.getElementsByClassName(HIDDEN_KEYWORD_CLASS)).forEach((card) => {
            if (!hidden.has(card)) card.classList.remove(HIDDEN_KEYWORD_CLASS);
        });
        hidden.forEach((card) => card.classList.add(HIDDEN_KEYWORD_CLASS));
    }

    function hideSearchSections() {
        const hidden = new Set();
        if (settings.enabled && settings.hideSearchSections && location.pathname === '/results') {
            queryAll('ytd-search:not([hidden]) :is(ytd-shelf-renderer, ytd-rich-section-renderer, grid-shelf-view-model, ytd-horizontal-card-list-renderer)').forEach((shelf) => {
                // Match section headings only: a video title must never hide unrelated search results.
                const heading = shelf.querySelector('#title-text, #header #title, #title-container #title, yt-section-header-view-model h2, .ytSectionHeaderViewModelTitle');
                if (heading && SEARCH_NOISE_TITLES.has(normalizeText(heading.textContent))) hidden.add(shelf);
            });
        }
        Array.from(document.getElementsByClassName(HIDDEN_SEARCH_CLASS)).forEach((shelf) => {
            if (!hidden.has(shelf)) shelf.classList.remove(HIDDEN_SEARCH_CLASS);
        });
        hidden.forEach((shelf) => shelf.classList.add(HIDDEN_SEARCH_CLASS));
    }

    function clearRecommendationsStyles(pane) {
        pane.panel.classList.remove('ytc-scrollable-recommendations');
        pane.inner.classList.remove('ytc-recommendations-inner');
        pane.secondary.classList.remove('ytc-recommendations-column');
        pane.inner.style.removeProperty('--ytc-recommendations-top');
        pane.panel.style.removeProperty('--ytc-recommendations-height');
    }

    function resetRecommendationsPane() {
        if (!recommendationsPane) return;
        clearRecommendationsStyles(recommendationsPane);
        recommendationsPane.observer.disconnect();
        recommendationsPane.resizeObserver?.disconnect();
        recommendationsPane = null;
    }

    function scheduleRecommendationsPane() {
        if (recommendationsFrameQueued || (!recommendationsPane &&
            (!settings.enabled || !settings.scrollRecommendations || !isWatchPage()))) return;
        recommendationsFrameQueued = true;
        requestAnimationFrame(() => {
            recommendationsFrameQueued = false;
            runCleanupTask('Independent recommendations', syncRecommendationsPane);
        });
    }

    function syncRecommendationsPane() {
        if (!settings.enabled || !settings.scrollRecommendations || !isWatchPage() || floatingNavigation) {
            resetRecommendationsPane();
            return;
        }
        const watch = document.querySelector('ytd-watch-flexy:not([hidden])');
        const primary = watch?.querySelector('#primary');
        const secondary = watch?.querySelector('#secondary');
        const inner = secondary?.querySelector('#secondary-inner');
        const panel = inner?.querySelector(':scope > #related');
        if (!primary || !panel) {
            resetRecommendationsPane();
            return;
        }
        if (recommendationsPane && (recommendationsPane.panel !== panel || recommendationsPane.inner !== inner ||
            recommendationsPane.secondary !== secondary || recommendationsPane.watch !== watch)) resetRecommendationsPane();
        if (!recommendationsPane) {
            const observer = new MutationObserver(scheduleRecommendationsPane);
            observer.observe(watch, { attributes: true, attributeFilter: ['theater', 'full-bleed-player', 'fullscreen', 'hidden', 'is-two-columns_'] });
            observer.observe(inner, { attributes: true, childList: true, subtree: true, attributeFilter: ['hidden', 'collapsed'] });
            recommendationsPane = { watch, secondary, inner, panel, observer };
            if (typeof ResizeObserver !== 'undefined') {
                recommendationsPane.resizeObserver = new ResizeObserver(scheduleRecommendationsPane);
                recommendationsPane.resizeObserver.observe(secondary);
                recommendationsPane.resizeObserver.observe(inner);
            }
        }
        const primaryRect = primary.getBoundingClientRect();
        const secondaryRect = secondary.getBoundingClientRect();
        const hasOtherPanels = Array.from(inner.children).some((child) => child !== panel && child.getBoundingClientRect().height > 1);
        const headerBottom = document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom || 56;
        const top = Math.max(12, Math.min(120, headerBottom) + 12);
        const panelTop = Math.max(top, panel.getBoundingClientRect().top);
        const height = Math.floor(floatingViewport().height - panelTop - 16);
        if (document.fullscreenElement || watch.hasAttribute('fullscreen') || watch.hasAttribute('theater') ||
            watch.hasAttribute('full-bleed-player') || hasOtherPanels || height < 200 ||
            !primaryRect.width || secondaryRect.width < 200 || secondaryRect.left < primaryRect.right - 1) {
            clearRecommendationsStyles(recommendationsPane);
            return;
        }
        inner.style.setProperty('--ytc-recommendations-top', top + 'px');
        panel.style.setProperty('--ytc-recommendations-height', height + 'px');
        secondary.classList.add('ytc-recommendations-column');
        inner.classList.add('ytc-recommendations-inner');
        panel.classList.add('ytc-scrollable-recommendations');
    }

    function parseFloatingLayout(value) {
        if (!value || typeof value !== 'object' ||
            !Number.isFinite(value.width) || value.width < 160 || value.width > 16384 ||
            !Number.isFinite(value.x) || value.x < 0 || value.x > 1 ||
            !Number.isFinite(value.y) || value.y < 0 || value.y > 1) return null;
        return { width: value.width, x: value.x, y: value.y };
    }

    function loadFloatingLayout() {
        try {
            return parseFloatingLayout(JSON.parse(localStorage.getItem(FLOATING_LAYOUT_KEY) || 'null'));
        } catch {
            return null;
        }
    }

    function saveFloatingLayout() {
        try {
            if (floatingLayout) localStorage.setItem(FLOATING_LAYOUT_KEY, JSON.stringify(floatingLayout));
            else localStorage.removeItem(FLOATING_LAYOUT_KEY);
        } catch {
            // Keep the chosen layout for this session if browser storage is unavailable.
        }
    }

    function floatingGeometry(layout, viewportWidth, viewportHeight, headerBottom, defaultRight = viewportWidth - 16) {
        const topLimit = Math.max(16, headerBottom + 8);
        const maxWidth = Math.max(1, Math.floor(Math.min(viewportWidth - 32, (viewportHeight - topLimit - 16) * 16 / 9)));
        const defaultWidth = Math.min(420, Math.max(280, viewportWidth * 0.3), (viewportHeight - headerBottom - 48) * 0.5 * 16 / 9);
        const width = Math.max(Math.min(280, maxWidth), Math.min(maxWidth, Math.round(layout?.width || defaultWidth)));
        const height = width * 9 / 16;
        return {
            width, height, topLimit, maxWidth,
            left: layout
                ? 16 + Math.max(0, viewportWidth - 32 - width) * layout.x
                : Math.max(16, Math.min(viewportWidth - 16 - width, defaultRight - width)),
            top: topLimit + Math.max(0, viewportHeight - topLimit - 16 - height) * (layout?.y ?? 1)
        };
    }

    function floatingViewport() {
        return {
            width: document.documentElement.clientWidth || window.innerWidth,
            height: document.documentElement.clientHeight || window.innerHeight
        };
    }

    function rememberFloatingRect(rect, topLimit) {
        const clamp = (value) => Math.max(0, Math.min(1, value));
        const viewport = floatingViewport();
        floatingLayout = {
            width: rect.width,
            x: clamp((rect.left - 16) / Math.max(1, viewport.width - 32 - rect.width)),
            y: clamp((rect.top - topLimit) / Math.max(1, viewport.height - topLimit - 16 - rect.width * 9 / 16))
        };
        scheduleFloatingPlayer();
    }

    function stopFloatingGesture(state, save) {
        const gesture = state?.gesture;
        if (!gesture) return;
        state.gesture = null;
        state.host.classList.remove('ytc-floating-interacting');
        if (gesture.handle.hasPointerCapture(gesture.id)) gesture.handle.releasePointerCapture(gesture.id);
        if (save && gesture.changed) saveFloatingLayout();
        else floatingLayout = gesture.previousLayout;
        scheduleFloatingPlayer();
    }

    function bindFloatingHandle(handle, state, corner = '') {
        handle.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); });
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !state.floating || state.gesture) return;
            event.preventDefault();
            event.stopPropagation();
            const viewport = floatingViewport();
            state.gesture = {
                id: event.pointerId, handle, corner, startX: event.clientX, startY: event.clientY,
                rect: state.host.getBoundingClientRect(), previousLayout: floatingLayout,
                viewportWidth: viewport.width, viewportHeight: viewport.height, changed: false
            };
            handle.setPointerCapture(event.pointerId);
            state.host.classList.add('ytc-floating-interacting');
        });
        handle.addEventListener('pointermove', (event) => {
            const gesture = state.gesture;
            if (!gesture || gesture.id !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const dx = event.clientX - gesture.startX;
            const dy = event.clientY - gesture.startY;
            if (!dx && !dy && !gesture.changed) return;
            gesture.changed = true;
            const rect = { left: gesture.rect.left + dx, top: gesture.rect.top + dy, width: gesture.rect.width };
            if (corner) {
                const viewport = floatingViewport();
                const fromLeft = corner.includes('left');
                const fromTop = corner.includes('top');
                const horizontal = dx * (fromLeft ? -1 : 1);
                const vertical = dy * (fromTop ? -1 : 1) * 16 / 9;
                const delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
                const maxWidth = Math.min(
                    fromLeft ? gesture.rect.right - 16 : viewport.width - 16 - gesture.rect.left,
                    (fromTop ? gesture.rect.bottom - state.geometry.topLimit : viewport.height - 16 - gesture.rect.top) * 16 / 9
                );
                rect.width = Math.max(Math.min(280, maxWidth), Math.min(maxWidth, gesture.rect.width + delta));
                rect.left = fromLeft ? gesture.rect.right - rect.width : gesture.rect.left;
                rect.top = fromTop ? gesture.rect.bottom - rect.width * 9 / 16 : gesture.rect.top;
            }
            rememberFloatingRect(rect, state.geometry.topLimit);
        });
        handle.addEventListener('pointerup', (event) => {
            if (state.gesture?.id !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            stopFloatingGesture(state, true);
        });
        ['pointercancel', 'lostpointercapture'].forEach((name) => {
            handle.addEventListener(name, () => stopFloatingGesture(state, false));
        });
    }

    function restoreFloatingPlayer() {
        if (!floatingPlayer?.floating) return;
        stopFloatingGesture(floatingPlayer, false);
        floatingPlayer.hideTooltip();
        floatingPlayer.floating = false;
        floatingPlayer.host.classList.remove('ytc-floating-player');
        ['width', 'left', 'top'].forEach((key) => floatingPlayer.host.style.removeProperty('--ytc-floating-' + key));
        floatingPlayer.controls.remove();
        // Let YouTube recalculate its own controls after the size change.
        window.dispatchEvent(new Event('resize'));
    }

    function resetFloatingPlayer() {
        if (!floatingPlayer) return;
        restoreFloatingPlayer();
        floatingPlayer.events.forEach((name) => {
            floatingPlayer.video.removeEventListener(name, scheduleFloatingPlayer);
        });
        floatingPlayer.resizeObserver?.disconnect();
        floatingPlayer.observer.disconnect();
        floatingPlayer = null;
    }

    function createFloatingControls(state) {
        const controls = createNode('div', 'ytc-floating-controls');
        const toolbar = createNode('div', 'ytc-floating-toolbar');
        const tooltip = createNode('div', 'ytc-floating-tooltip');
        tooltip.id = 'ytc-floating-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        let tooltipTimer;
        let tooltipButton;
        state.hideTooltip = () => {
            window.clearTimeout(tooltipTimer);
            tooltip.hidden = true;
            tooltipButton?.removeAttribute('aria-describedby');
            tooltipButton = null;
        };
        const attachTooltip = (button, text) => {
            const show = () => {
                if (!state.floating || state.gesture) return;
                state.hideTooltip();
                tooltipButton = button;
                tooltip.textContent = text;
                tooltip.hidden = false;
                button.setAttribute('aria-describedby', tooltip.id);
                const player = state.host.getBoundingClientRect();
                const target = button.getBoundingClientRect();
                const box = tooltip.getBoundingClientRect();
                const left = target.left - player.left + (target.width - box.width) / 2;
                let top = target.bottom - player.top + 8;
                if (top + box.height > player.height - 8) top = target.top - player.top - box.height - 8;
                tooltip.style.left = Math.max(8, Math.min(player.width - box.width - 8, left)) + 'px';
                tooltip.style.top = Math.max(8, top) + 'px';
            };
            button.addEventListener('pointerenter', () => {
                state.hideTooltip();
                tooltipTimer = window.setTimeout(show, 300);
            });
            button.addEventListener('focus', show);
            ['pointerleave', 'blur', 'pointerdown'].forEach((name) => button.addEventListener(name, state.hideTooltip));
        };
        const move = createNode('button', 'ytc-floating-drag');
        move.type = 'button';
        move.tabIndex = -1;
        move.setAttribute('aria-label', 'Move floating player');
        attachTooltip(move, 'Drag to move');
        const grip = createSvgElement('svg', {
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
            'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
        });
        grip.appendChild(createSvgElement('path', { d: 'M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3' }));
        move.appendChild(grip);
        bindFloatingHandle(move, state);
        toolbar.appendChild(move);
        const actionGroup = createNode('div', 'ytc-floating-actions');
        const actions = [
            ['Reset floating size and position', 'M3 10a9 9 0 1 1 2 8M3 4v6h6', () => {
                stopFloatingGesture(state, false);
                floatingLayout = null;
                saveFloatingLayout();
                scheduleFloatingPlayer();
            }],
            ['Back to video', 'm7 14 5-5 5 5M12 9v10M5 5h14', () => {
                state.dismissed = true;
                restoreFloatingPlayer();
                window.scrollBy({ top: state.anchor.getBoundingClientRect().top - 72, behavior: 'smooth' });
            }],
            ['Dismiss floating player', 'm6 6 12 12M6 18 18 6', () => {
                state.dismissed = true;
                restoreFloatingPlayer();
            }]
        ];
        actions.forEach(([label, path, action]) => {
            const button = createNode('button');
            button.type = 'button';
            button.setAttribute('aria-label', label);
            attachTooltip(button, label === 'Reset floating size and position' ? 'Reset size and position' : label === 'Dismiss floating player' ? 'Hide floating player' : label);
            const icon = createSvgElement('svg', {
                viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
                'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
            });
            icon.appendChild(createSvgElement('path', { d: path }));
            button.appendChild(icon);
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                action();
            });
            actionGroup.appendChild(button);
        });
        toolbar.appendChild(actionGroup);
        controls.appendChild(toolbar);
        ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach((corner) => {
            const handle = createNode('button', 'ytc-floating-resize');
            handle.type = 'button';
            handle.tabIndex = -1;
            handle.dataset.corner = corner;
            const label = 'Resize floating player from ' + corner.replace('-', ' ');
            handle.setAttribute('aria-label', label);
            attachTooltip(handle, 'Drag to resize');
            bindFloatingHandle(handle, state, corner);
            controls.appendChild(handle);
        });
        controls.appendChild(tooltip);
        return controls;
    }

    function scheduleFloatingPlayer() {
        if (floatingFrameQueued || (!floatingPlayer && (!settings.enabled || !settings.floatingPlayer))) return;
        floatingFrameQueued = true;
        requestAnimationFrame(() => {
            floatingFrameQueued = false;
            runCleanupTask('Floating player', syncFloatingPlayer);
        });
    }

    function syncFloatingPlayer() {
        if (!settings.enabled || !settings.floatingPlayer || !isWatchPage() || floatingNavigation) {
            resetFloatingPlayer();
            return;
        }

        const watch = document.querySelector('ytd-watch-flexy:not([hidden])');
        const host = watch?.querySelector('#player-container');
        const video = host?.querySelector('#movie_player video.html5-main-video');
        const anchor = host?.parentElement;
        // These wrappers reserve the original player space even when its absolute child is fixed.
        // Unknown layouts stay untouched rather than risking broken playback or a page jump.
        if (!video || !['player-container-inner', 'player-full-bleed-container'].includes(anchor?.id)) {
            resetFloatingPlayer();
            return;
        }

        const videoId = getCurrentVideoId();
        if (floatingPlayer && (floatingPlayer.host !== host || floatingPlayer.video !== video ||
            floatingPlayer.anchor !== anchor || floatingPlayer.videoId !== videoId)) {
            resetFloatingPlayer();
        }
        if (!floatingPlayer) {
            const state = {
                host, anchor, video, videoId, floating: false, dismissed: false,
                events: ['playing', 'pause', 'ended', 'emptied', 'loadedmetadata',
                    'enterpictureinpicture', 'leavepictureinpicture']
            };
            state.controls = createFloatingControls(state);
            state.events.forEach((name) => video.addEventListener(name, scheduleFloatingPlayer));
            state.observer = new MutationObserver(scheduleFloatingPlayer);
            state.observer.observe(watch, { attributes: true, attributeFilter: ['theater', 'fullscreen', 'hidden', 'video-id'] });
            state.observer.observe(host.querySelector('#movie_player'), { attributes: true, attributeFilter: ['class'] });
            if (typeof ResizeObserver !== 'undefined') {
                state.resizeObserver = new ResizeObserver(scheduleFloatingPlayer);
                state.resizeObserver.observe(anchor);
            }
            floatingPlayer = state;
        }

        const state = floatingPlayer;
        const rect = anchor.getBoundingClientRect();
        const headerBottom = document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom || 56;
        const threshold = Math.max(0, Math.min(120, headerBottom));
        const viewport = floatingViewport();
        if (rect.bottom > threshold + 32) state.dismissed = false;

        const unavailable = document.fullscreenElement || document.pictureInPictureElement ||
            watch.hasAttribute('fullscreen') || host.querySelector('.ytp-player-minimized') ||
            viewport.width < 640 || viewport.height < 400 ||
            !rect.width || !rect.height || video.ended || video.readyState < 2;
        if (unavailable || state.dismissed || rect.bottom > threshold + (state.floating ? 32 : 0)) {
            restoreFloatingPlayer();
            return;
        }
        // A paused video should not pop out, but keep the controls available if paused while floating.
        if (!state.floating && video.paused) return;

        if (state.gesture && (state.gesture.viewportWidth !== viewport.width || state.gesture.viewportHeight !== viewport.height)) {
            stopFloatingGesture(state, false);
        }
        const mainRect = (watch.querySelector('#primary-inner') || watch.querySelector('#primary'))?.getBoundingClientRect();
        const sideRect = watch.querySelector('#secondary')?.getBoundingClientRect();
        const defaultRight = mainRect?.width && sideRect?.width >= 200 && sideRect.left >= mainRect.right - 1
            ? mainRect.right : undefined;
        const geometry = floatingGeometry(floatingLayout, viewport.width, viewport.height, threshold, defaultRight);
        const resized = state.geometry && state.geometry.width !== geometry.width;
        state.geometry = geometry;
        ['width', 'left', 'top'].forEach((key) => {
            const value = geometry[key] + 'px';
            if (host.style.getPropertyValue('--ytc-floating-' + key) !== value) host.style.setProperty('--ytc-floating-' + key, value);
        });
        if (!state.floating) {
            state.floating = true;
            host.classList.add('ytc-floating-player');
            host.appendChild(state.controls);
            window.dispatchEvent(new Event('resize'));
        } else if (resized) window.dispatchEvent(new Event('resize'));
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
        runCleanupTask('Floating player', syncFloatingPlayer);
        runCleanupTask('Independent recommendations', syncRecommendationsPane);
        runCleanupTask('Search sections', hideSearchSections);
        runCleanupTask('Title filters', filterVideoTitles);
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
        const ownedSelector = '#ytc-menu, #ytc-button-wrap, #ytc-dislikes, .ytc-floating-controls';

        return mutations.some((mutation) => {
            if (mutation.type === 'characterData') {
                return settings.enabled && (settings.filterVideoTitles || settings.hideSearchSections) &&
                    Boolean(mutation.target.parentElement?.closest('ytd-search, ' + VIDEO_CARD_SELECTOR)) &&
                    !mutation.target.parentElement.closest(ownedSelector);
            }
            if (mutation.type === 'attributes') {
                const titleChanged = settings.filterVideoTitles && mutation.attributeName === 'title';
                return settings.enabled && ((settings.hideShorts && mutation.attributeName !== 'title') ||
                    titleChanged ||
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
        root.dataset.ytcHideEndCards = settings.enabled && settings.hideEndCards ? 'true' : 'false';
        root.dataset.ytcHideMembersOnly = settings.enabled && settings.hideMembersOnly ? 'true' : 'false';
        root.dataset.ytcHideUpcoming =
            settings.enabled && settings.hideUpcomingVideos ? 'true' : 'false';
        root.dataset.ytcHideUnsubscribedCollaborations =
            collaborationFilterActive() ? 'true' : 'false';
        root.dataset.ytcColumns =
            settings.enabled && !settings.automaticColumns ? settings.columns : 'auto';

        updateButtonState();
        updateMenuState();

        if (!collaborationFilterActive()) resetCollaborationFilter();
        if (!settings.enabled || !settings.floatingPlayer) resetFloatingPlayer();
        if (!settings.enabled || !settings.scrollRecommendations) resetRecommendationsPane();
        if (!settings.enabled || !settings.filterVideoTitles) unhideElements(HIDDEN_KEYWORD_CLASS);
        if (!settings.enabled || !settings.hideSearchSections) unhideElements(HIDDEN_SEARCH_CLASS);

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
            .ytc-recommendations-column { align-self: stretch !important; }
            .ytc-recommendations-inner {
                position: sticky !important;
                top: var(--ytc-recommendations-top) !important;
            }
            .ytc-scrollable-recommendations {
                max-height: var(--ytc-recommendations-height) !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                min-width: 0;
                max-width: 100%;
                overscroll-behavior-y: contain;
                scrollbar-width: thin;
                scrollbar-gutter: stable;
            }
            .ytc-scrollable-recommendations > ytd-watch-next-secondary-results-renderer { max-width: 100%; }

            #player-container.ytc-floating-player {
                position: fixed !important;
                inset: var(--ytc-floating-top) auto auto var(--ytc-floating-left) !important;
                width: var(--ytc-floating-width) !important;
                height: calc(var(--ytc-floating-width) * 9 / 16) !important;
                min-width: 0 !important;
                min-height: 0 !important;
                max-width: none !important;
                max-height: none !important;
                margin: 0 !important;
                z-index: 2018 !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                isolation: isolate;
                background: #000;
                box-shadow: 0 8px 32px #0007, 0 0 0 1px #ffffff26;
            }

            ytd-watch-flexy:has(.ytc-floating-player) #full-bleed-container {
                overflow: visible !important;
                z-index: 2018 !important;
            }

            .ytc-floating-player #movie_player,
            .ytc-floating-player .html5-video-container {
                width: 100% !important;
                height: 100% !important;
            }

            .ytc-floating-player #movie_player { border-radius: 12px !important; }
            .ytc-floating-interacting { user-select: none; }

            .ytc-floating-player video.html5-main-video {
                width: 100% !important;
                height: 100% !important;
                left: 0 !important;
                top: 0 !important;
                object-fit: contain !important;
            }

            .ytc-floating-player .ytp-chrome-bottom {
                left: 8px !important;
                right: 8px !important;
                width: auto !important;
                min-width: 0 !important;
            }

            .ytc-floating-player .ytp-size-button,
            .ytc-floating-player .ytp-miniplayer-button {
                display: none !important;
            }

            .ytc-floating-controls {
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 1000;
            }

            .ytc-floating-toolbar {
                position: absolute;
                top: 10px;
                left: 10px;
                right: 10px;
                display: flex;
                justify-content: space-between;
                opacity: 0;
                transition: opacity .12s ease;
            }

            .ytc-floating-player:hover .ytc-floating-toolbar,
            .ytc-floating-controls:has(:focus-visible) .ytc-floating-toolbar,
            .ytc-floating-interacting .ytc-floating-toolbar { opacity: 1; }

            .ytc-floating-actions,
            .ytc-floating-controls .ytc-floating-drag {
                border-radius: 999px;
            }
            .ytc-floating-actions { display: flex; gap: 4px; }

            .ytc-floating-controls button {
                display: grid;
                place-items: center;
                width: 40px;
                height: 40px;
                padding: 8px;
                border: 0;
                border-radius: 50%;
                background: rgba(0, 0, 0, .3);
                color: #fff;
                cursor: pointer;
                pointer-events: none;
            }

            .ytc-floating-player:hover .ytc-floating-toolbar button,
            .ytc-floating-controls:has(:focus-visible) .ytc-floating-toolbar button,
            .ytc-floating-interacting .ytc-floating-toolbar button { pointer-events: auto; }
            .ytc-floating-controls .ytc-floating-drag { cursor: grab; touch-action: none; }
            .ytc-floating-interacting .ytc-floating-drag { cursor: grabbing; }
            .ytc-floating-controls .ytc-floating-resize {
                position: absolute;
                width: 20px;
                height: 20px;
                padding: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                touch-action: none;
                pointer-events: auto;
            }
            .ytc-floating-resize::after {
                content: '';
                position: absolute;
                right: 4px;
                bottom: 4px;
                width: 7px;
                height: 7px;
                border-right: 1.5px solid #fff;
                border-bottom: 1.5px solid #fff;
                border-bottom-right-radius: 2px;
                filter: drop-shadow(0 1px 2px #000);
                opacity: 0;
            }
            .ytc-floating-resize[data-corner="top-left"] { top: 0; left: 0; cursor: nwse-resize; transform: rotate(180deg); }
            .ytc-floating-resize[data-corner="top-right"] { top: 0; right: 0; cursor: nesw-resize; transform: rotate(-90deg); }
            .ytc-floating-resize[data-corner="bottom-left"] { bottom: 0; left: 0; cursor: nesw-resize; transform: rotate(90deg); }
            .ytc-floating-resize[data-corner="bottom-right"] { bottom: 0; right: 0; cursor: nwse-resize; }
            .ytc-floating-controls .ytc-floating-resize:hover,
            .ytc-floating-controls .ytc-floating-resize:focus-visible { background: transparent; }
            .ytc-floating-resize:hover::after,
            .ytc-floating-resize:focus-visible::after { opacity: .9; }

            .ytc-floating-controls button:hover { background-color: rgba(0, 0, 0, .5); }
            .ytc-floating-controls button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
            .ytc-floating-controls svg { width: 24px; height: 24px; pointer-events: none; }
            .ytc-floating-tooltip {
                position: absolute;
                z-index: 1;
                box-sizing: border-box;
                max-width: calc(100% - 16px);
                padding: 5px 9px;
                border-radius: 8px;
                background: rgba(0, 0, 0, .3);
                color: #eee;
                font: 500 13px/15px "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                pointer-events: none;
            }
            .ytc-floating-tooltip[hidden] { display: none !important; }
            @media (prefers-reduced-motion: reduce) { .ytc-floating-toolbar { transition: none; } }

            .ytc-hidden-shorts,
            .ytc-hidden-subscriptions,
            .ytc-hidden-search-section,
            .ytc-hidden-title {
                display: none !important;
            }

            html[data-ytc-hide-end-cards="true"] #movie_player :is(.ytp-ce-element, .ytp-ce-hide-button-container) {
                display: none !important;
            }

            html[data-ytc-hide-members-only="true"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model):not(ytd-browse[page-subtype="history"] *):has(:is(.badge-style-type-members-only, .yt-badge-shape--membership, .ytBadgeShapeMembership)) {
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

            /* Hide the label in previews and the floating view, not the full-size player. */
            html[data-ytc-hide-paid-promotion="true"] :is(ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-thumbnail, yt-thumbnail-view-model, ytd-video-preview, #inline-player, .ytp-inline-preview-mode, .ytc-floating-player) :is(.ytp-paid-content-overlay, .ytmPaidContentOverlayHost, .YtmPaidContentOverlayHost, ytm-paid-content-overlay-renderer, a[href^="https://support.google.com/youtube"][href*="p=ppp"]) {
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
            #ytc-menu input:focus-visible,
            #ytc-menu textarea:focus-visible,
            #ytc-menu summary:focus-visible {
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
                gap: clamp(8px, 2vw, 18px);
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
                white-space: nowrap;
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

            #ytc-menu .ytc-keyword-editor { margin: 0 0 12px; }
            #ytc-menu .ytc-keyword-editor summary { cursor: pointer; color: var(--ytc-muted); padding: 4px 0; }
            #ytc-menu .ytc-keyword-editor textarea {
                box-sizing: border-box;
                display: block;
                width: 100%;
                min-height: 110px;
                margin: 8px 0;
                padding: 10px;
                resize: vertical;
                border: 1px solid var(--ytc-line);
                border-radius: 6px;
                background: var(--ytc-hover);
                color: var(--ytc-text);
                font: inherit;
                line-height: 1.5;
            }
            #ytc-menu .ytc-keyword-pages { border: 0; padding: 8px 0 0; margin: 0; min-width: 0; }
            #ytc-menu .ytc-keyword-pages legend { color: var(--ytc-muted); font-size: 12px; }
            #ytc-menu .ytc-keyword-page-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            #ytc-menu .ytc-keyword-page-list label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
            #ytc-menu .ytc-keyword-page-list input { margin: 0; accent-color: var(--ytc-accent); }

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

    function createKeywordEditor() {
        const details = createNode('details', 'ytc-keyword-editor');
        details.appendChild(createNode('summary', null, 'Edit words and pages'));
        const label = createNode('label', 'ytc-help', 'One word or phrase per line. Matches title fragments, ignoring case and accents. No regular expressions.');
        label.htmlFor = 'ytc-title-keywords';
        label.id = 'ytc-title-keywords-help';
        const textarea = createNode('textarea');
        textarea.id = 'ytc-title-keywords';
        textarea.rows = 5;
        textarea.maxLength = 10000;
        textarea.spellcheck = false;
        textarea.value = settings.blockedTitleKeywords;
        textarea.setAttribute('aria-label', 'Blocked title words and phrases');
        textarea.setAttribute('aria-describedby', label.id);
        textarea.addEventListener('input', () => {
            settings.blockedTitleKeywords = textarea.value.slice(0, 10000);
            saveSettings();
        });
        // Keep typing shortcuts inside the editor, not in YouTube's player.
        textarea.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') event.stopPropagation();
        });
        details.appendChild(label);
        details.appendChild(textarea);
        const pages = createNode('fieldset', 'ytc-keyword-pages');
        pages.appendChild(createNode('legend', null, 'Apply on — History is always excluded'));
        const list = createNode('div', 'ytc-keyword-page-list');
        Object.entries(KEYWORD_PAGE_LABELS).forEach(([page, title]) => {
            const wrap = createNode('label');
            const input = createNode('input');
            input.type = 'checkbox';
            input.dataset.keywordPage = page;
            input.checked = settings.keywordFilterPages.includes(page);
            input.addEventListener('change', () => {
                settings.keywordFilterPages = Array.from(list.querySelectorAll('input:checked')).map((box) => box.dataset.keywordPage);
                saveSettings();
            });
            wrap.appendChild(input);
            wrap.appendChild(createNode('span', null, title));
            list.appendChild(wrap);
        });
        pages.appendChild(list);
        details.appendChild(pages);
        return details;
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

        const browsingSection = createSection(
            'Browsing',
            createSwitchRow(
                'Hide Shorts',
                'Remove Shorts from feeds, sidebar, and direct links',
                'hideShorts'
            ),
            createWatchedModeSlider()
        );
        const interfaceSection = createSection(
            'Sections',
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
                'Clean search results',
                'Hide recognized recommendation sections, not regular results',
                'hideSearchSections'
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
            'Ratings',
            createSwitchRow(
                'Show dislikes',
                'Display Return YouTube Dislike counts on watch pages',
                'showDislikes'
            )
        );

        const playbackSection = createSection(
            'While watching',
            createSwitchRow(
                'Floating player',
                'Keep playing in the corner when you scroll to comments',
                'floatingPlayer'
            ),
            createSwitchRow(
                'Independent recommendations',
                'Scroll the right-hand list without moving the video or comments',
                'scrollRecommendations'
            )
        );

        const overlaySection = createSection(
            'Overlays',
            createSwitchRow(
                'Hide end cards',
                'Remove cards covering the last seconds; keep subtitles and playback controls',
                'hideEndCards'
            ),
            createSwitchRow(
                'Hide promotion labels',
                'Remove paid-promotion banners from previews and the floating player',
                'hidePaidPromotion'
            )
        );

        const videoTypeSection = createSection(
            'Video types',
            createSwitchRow(
                'Hide YouTube Mixes',
                'Keep regular playlists, remove auto-generated Mixes',
                'hideMixes'
            ),
            createSwitchRow(
                'Hide members-only videos',
                'Hide all membership-badged videos, including ones you can access; never History',
                'hideMembersOnly'
            )
        );

        const keywordSection = createSection(
            'Title filters',
            createSwitchRow('Filter video titles', 'Hide titles containing your words or phrases on selected pages', 'filterVideoTitles'),
            createKeywordEditor()
        );

        const tabs = createNode('div', 'ytc-tabs');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Settings sections');
        const body = createNode('div', 'ytc-menu-body');
        const groups = [
            { id: 'browse', title: 'Browse', sections: [browsingSection, layoutSection, interfaceSection] },
            { id: 'subscriptions', title: 'Subscriptions', sections: [subscriptionsSection] },
            { id: 'filters', title: 'Filters', sections: [videoTypeSection, keywordSection] },
            { id: 'player', title: 'Player', sections: [playbackSection, overlaySection, extrasSection] }
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
        const body = menu.querySelector('.ytc-menu-body');
        if (changed) menuTabScrollPositions.set(currentMenuTab, body.scrollTop);
        currentMenuTab = tabId;
        menu.querySelectorAll('.ytc-tab').forEach((button) => {
            const selected = button === tab;
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
            button.tabIndex = selected ? 0 : -1;
        });
        menu.querySelectorAll('.ytc-panel').forEach((panel) => {
            panel.hidden = panel.id !== 'ytc-panel-' + tabId;
        });
        if (changed) body.scrollTop = menuTabScrollPositions.get(tabId) || 0;
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
        const keywords = menu.querySelector('#ytc-title-keywords');
        if (keywords && document.activeElement !== keywords && keywords.value !== settings.blockedTitleKeywords) {
            keywords.value = settings.blockedTitleKeywords;
        }
        menu.querySelectorAll('input[data-keyword-page]').forEach((input) => {
            input.checked = settings.keywordFilterPages.includes(input.dataset.keywordPage);
        });

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
            attributeFilter: ['href', 'overlay-style', 'is-shorts', 'title'],
            characterData: true
        });

        ['yt-navigate-finish', 'yt-page-data-updated', 'popstate'].forEach((eventName) => {
            window.addEventListener(eventName, () => {
                if (eventName !== 'yt-page-data-updated') floatingNavigation = false;
                scheduleFloatingPlayer();
                scheduleRecommendationsPane();
                updateWatchedVideosState();
                document.documentElement.dataset.ytcHideUnsubscribedCollaborations =
                    collaborationFilterActive() ? 'true' : 'false';
                if (eventName === 'yt-navigate-finish' || !collaborationFilterActive()) resetCollaborationFilter();
                scheduleCleanup();
            });
        });
        window.addEventListener('yt-navigate-start', () => {
            floatingNavigation = true;
            resetFloatingPlayer();
            resetRecommendationsPane();
        });
        window.addEventListener('load', scheduleCleanup);
        window.addEventListener('resize', positionMenu);
        window.addEventListener('resize', scheduleFloatingPlayer);
        window.addEventListener('resize', scheduleRecommendationsPane);
        window.addEventListener('scroll', positionMenu, true);
        window.addEventListener('scroll', scheduleFloatingPlayer, { passive: true });
        document.addEventListener('fullscreenchange', scheduleFloatingPlayer);
        document.addEventListener('fullscreenchange', scheduleRecommendationsPane);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && floatingPlayer?.gesture) {
                event.preventDefault();
                event.stopPropagation();
                stopFloatingGesture(floatingPlayer, false);
            }
        }, true);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                scheduleCleanup();
                refreshReactionCounters();
            }
        });
        window.addEventListener('storage', (event) => {
            if (event.key === FLOATING_LAYOUT_KEY) {
                stopFloatingGesture(floatingPlayer, false);
                floatingLayout = loadFloatingLayout();
                scheduleFloatingPlayer();
                return;
            }
            if (event.key !== STORAGE_KEY) return;

            settings = loadSettings();
            applyState();
        });

        document.addEventListener('DOMContentLoaded', scheduleCleanup);

        setInterval(refreshReactionCounters, 60000);
    }

    start();
})();
