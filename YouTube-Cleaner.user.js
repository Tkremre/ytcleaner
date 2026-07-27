// ==UserScript==
// @name         YouTube Cleaner - Hide Shorts & Clean Layout
// @namespace    https://github.com/Tkremre/ytcleaner
// @version      1.1.0
// @description  Hide YouTube Shorts, clean subscriptions, restore a denser desktop grid, and optionally show dislike counts.
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
        dimWatchedVideos: false,
        hideSubscriptionSections: true,
        showDislikes: false
    };

    const VALID_COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const HIDDEN_SHORTS_CLASS = 'ytc-hidden-shorts';
    const HIDDEN_SUBSCRIPTIONS_CLASS = 'ytc-hidden-subscriptions';
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
            loaded.dimWatchedVideos = typeof loaded.dimWatchedVideos === 'boolean'
                ? loaded.dimWatchedVideos
                : DEFAULTS.dimWatchedVideos;
            loaded.hideSubscriptionSections = typeof loaded.hideSubscriptionSections === 'boolean'
                ? loaded.hideSubscriptionSections
                : DEFAULTS.hideSubscriptionSections;
            loaded.showDislikes = typeof loaded.showDislikes === 'boolean'
                ? loaded.showDislikes
                : DEFAULTS.showDislikes;

            delete loaded.shortsMode;
            delete loaded.redirectShorts;
            delete loaded.redirectHomeToSubscriptions;
            delete loaded.hideCommunityPosts;
            delete loaded.cleanSidebar;

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
            'ytd-mini-guide-entry-renderer'
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

    function applyState() {
        const root = document.documentElement;

        root.dataset.ytcEnabled = settings.enabled ? 'true' : 'false';
        root.dataset.ytcHideShorts =
            settings.enabled && settings.hideShorts ? 'true' : 'false';
        root.dataset.ytcDimWatchedVideos =
            settings.enabled && settings.dimWatchedVideos ? 'true' : 'false';
        root.dataset.ytcColumns =
            settings.enabled && !settings.automaticColumns ? settings.columns : 'auto';

        updateButtonState();
        updateMenuState();

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

            html[data-ytc-hide-shorts="true"] ytd-reel-shelf-renderer,
            html[data-ytc-hide-shorts="true"] ytd-rich-shelf-renderer[is-shorts],
            html[data-ytc-hide-shorts="true"] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-hide-shorts="true"] ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-hide-shorts="true"] yt-tab-shape[tab-title="Shorts"] {
                display: none !important;
            }

            html[data-ytc-dim-watched-videos="true"] ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer),
            html[data-ytc-dim-watched-videos="true"] ytd-rich-item-renderer:has(yt-thumbnail-overlay-progress-bar-view-model),
            html[data-ytc-dim-watched-videos="true"] ytd-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer),
            html[data-ytc-dim-watched-videos="true"] ytd-grid-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer),
            html[data-ytc-dim-watched-videos="true"] yt-lockup-view-model:has(yt-thumbnail-overlay-progress-bar-view-model) {
                opacity: .5;
                transition: opacity .15s ease;
            }

            html[data-ytc-dim-watched-videos="true"] ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer):hover,
            html[data-ytc-dim-watched-videos="true"] ytd-rich-item-renderer:has(yt-thumbnail-overlay-progress-bar-view-model):hover,
            html[data-ytc-dim-watched-videos="true"] ytd-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer):hover,
            html[data-ytc-dim-watched-videos="true"] ytd-grid-video-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer):hover,
            html[data-ytc-dim-watched-videos="true"] yt-lockup-view-model:has(yt-thumbnail-overlay-progress-bar-view-model):hover {
                opacity: 1;
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
                position: fixed;
                top: 58px;
                right: 12px;
                z-index: 2147483647;
                width: 320px;
                max-width: calc(100vw - 24px);
                max-height: calc(100vh - 24px);
                overflow-y: auto;
                padding: 12px;
                border-radius: 12px;
                background: #ffffff !important;
                color: #0f0f0f !important;
                box-shadow: 0 8px 28px rgba(0, 0, 0, .24);
                border: 1px solid rgba(0, 0, 0, .12);
                font-family: Roboto, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.35;
                opacity: 1 !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                isolation: isolate;
            }

            html[dark] #ytc-menu {
                background: #282828 !important;
                color: #f1f1f1 !important;
                border-color: rgba(255, 255, 255, .12);
                box-shadow: 0 8px 28px rgba(0, 0, 0, .55);
            }

            #ytc-menu[hidden] {
                display: none !important;
            }

            #ytc-menu,
            #ytc-menu * {
                box-sizing: border-box;
            }

            .ytc-title {
                font-size: 15px;
                font-weight: 600;
                margin-bottom: 12px;
                color: inherit;
            }

            .ytc-section {
                padding: 10px 0;
                border-top: 1px solid rgba(0, 0, 0, .10);
            }

            html[dark] .ytc-section {
                border-top-color: rgba(255, 255, 255, .12);
            }

            .ytc-title + .ytc-section {
                border-top: 0;
                padding-top: 0;
            }

            .ytc-section-title {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0;
                text-transform: uppercase;
                opacity: .68;
                margin-bottom: 4px;
                color: inherit;
            }

            .ytc-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 8px 0;
            }

            .ytc-row > div:first-child {
                min-width: 0;
            }

            .ytc-label {
                line-height: 1.3;
                color: inherit;
            }

            .ytc-help {
                opacity: .72;
                font-size: 12px;
                margin-top: 2px;
                color: inherit;
            }

            #ytc-menu .ytc-switch {
                width: 42px;
                height: 24px;
                border-radius: 999px;
                border: 0;
                cursor: pointer;
                background: rgba(255, 255, 255, .18) !important;
                position: relative;
                flex: 0 0 auto;
                padding: 0;
                margin: 0;
            }

            html:not([dark]) #ytc-menu .ytc-switch {
                background: rgba(0, 0, 0, .18) !important;
            }

            #ytc-menu .ytc-switch::after {
                content: "";
                position: absolute;
                width: 18px;
                height: 18px;
                top: 3px;
                left: 3px;
                border-radius: 50%;
                background: #ffffff;
                box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
                transition: transform .15s ease;
            }

            html:not([dark]) #ytc-menu .ytc-switch::after {
                background: #ffffff;
            }

            #ytc-menu .ytc-switch[data-active="true"] {
                background: #3ea6ff !important;
            }

            #ytc-menu .ytc-switch[data-active="true"]::after {
                transform: translateX(18px);
                background: #ffffff;
            }

            #ytc-menu .ytc-switch:disabled {
                cursor: not-allowed;
                opacity: .45;
            }

            .ytc-slider-wrap {
                margin: 10px 0 2px;
            }

            .ytc-slider-head {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 8px;
            }

            .ytc-slider-value {
                font-size: 12px;
                font-weight: 700;
                color: #3ea6ff;
                white-space: nowrap;
            }

            .ytc-slider {
                width: 100%;
                accent-color: #3ea6ff;
            }

            .ytc-slider:disabled {
                cursor: not-allowed;
                opacity: .45;
            }

            .ytc-slider-scale {
                display: flex;
                justify-content: space-between;
                margin-top: 2px;
                font-size: 11px;
                opacity: .65;
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

    function createSwitchRow(title, help, settingKey) {
        const row = createNode('div', 'ytc-row');
        const textWrap = document.createElement('div');

        const label = createNode('div', 'ytc-label', title);
        const helpText = createNode('div', 'ytc-help', help);

        const button = createNode('button', 'ytc-switch');
        button.type = 'button';
        button.dataset.setting = settingKey;
        button.setAttribute('role', 'switch');
        button.setAttribute('aria-label', title);

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

        const title = createNode('div', 'ytc-title', 'YouTube Cleaner');

        const generalSection = createSection(
            'General',
            createSwitchRow(
                'Cleaner',
                'Master switch for all cleanup features',
                'enabled'
            )
        );

        const shortsSection = createSection(
            'Shorts',
            createSwitchRow(
                'Hide Shorts',
                'Remove Shorts from feeds, navigation, and direct Shorts pages',
                'hideShorts'
            )
        );

        const browsingSection = createSection(
            'Browsing',
            createSwitchRow(
                'Dim watched videos',
                'Fade videos that already have a progress bar',
                'dimWatchedVideos'
            )
        );

        const subscriptionsSection = createSection(
            'Subscriptions',
            createSwitchRow(
                'Hide noisy sections',
                'Remove recommended and most relevant blocks',
                'hideSubscriptionSections'
            )
        );

        const layoutSection = createSection(
            'Layout',
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

        menu.appendChild(title);
        menu.appendChild(generalSection);
        menu.appendChild(shortsSection);
        menu.appendChild(browsingSection);
        menu.appendChild(subscriptionsSection);
        menu.appendChild(layoutSection);
        menu.appendChild(extrasSection);

        document.body.appendChild(menu);

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;

            const clickedButton = event.target.closest('#ytc-button-wrap');
            const clickedMenu = event.target.closest('#ytc-menu');

            if (!clickedButton && !clickedMenu) {
                menu.hidden = true;
                updateMenuExpandedState();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || menu.hidden) return;

            menu.hidden = true;
            updateMenuExpandedState();

            const button = document.getElementById('ytc-button');
            if (button) {
                button.focus();
            }
        });

        updateMenuState();
    }

    function positionMenu() {
        const button = document.getElementById('ytc-button');
        const menu = document.getElementById('ytc-menu');

        if (!button || !menu || menu.hidden) return;

        const rect = button.getBoundingClientRect();
        const margin = 12;

        let top = Math.round(rect.bottom + 8);
        let right = Math.round(window.innerWidth - rect.right);

        if (right < margin) {
            right = margin;
        }

        const menuHeight = menu.offsetHeight || 220;
        const maxTop = window.innerHeight - menuHeight - margin;

        if (top > maxTop) {
            top = Math.max(margin, maxTop);
        }

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
            positionMenu();
            requestAnimationFrame(positionMenu);
        }
    }

    function updateButtonState() {
        const button = document.getElementById('ytc-button');
        if (!button) return;

        button.dataset.active = settings.enabled ? 'true' : 'false';
        button.setAttribute('aria-pressed', settings.enabled ? 'true' : 'false');
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

        menu.querySelectorAll('.ytc-switch[data-setting]').forEach((button) => {
            const settingKey = button.dataset.setting;
            const isActive = Boolean(settings[settingKey]);

            button.dataset.active = isActive ? 'true' : 'false';
            button.setAttribute('aria-checked', isActive ? 'true' : 'false');
            button.removeAttribute('aria-pressed');
            button.disabled = false;
            button.setAttribute('aria-disabled', 'false');
        });

        const slider = menu.querySelector('#ytc-column-slider');
        const value = menu.querySelector('#ytc-column-value');

        if (slider) {
            slider.value = settings.columns;
            slider.disabled = settings.automaticColumns;
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
            subtree: true
        });

        window.addEventListener('yt-navigate-finish', scheduleCleanup);
        window.addEventListener('yt-page-data-updated', scheduleCleanup);
        window.addEventListener('popstate', scheduleCleanup);
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
