// ==UserScript==
// @name         YouTube Cleaner
// @namespace    https://github.com/Tkremre/ytcleaner
// @version      1.0.0
// @description  Bring back a cleaner old-school YouTube desktop layout.
// @author       Tkremre
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'yt_cleaner_settings_v1';

    const DEFAULTS = {
        enabled: true,
        columns: '5',
        redirectShorts: true
    };

    const VALID_COLUMNS = ['3', '4', '5', '6'];

    const BLOCKED_SUBSCRIPTION_TITLES = [
        'most relevant',
        'les plus pertinentes',
        'más relevantes',
        'mais relevantes',
        'più pertinenti',
        'am relevantesten',
        'meest relevant',
        'najtrafniejsze',
        'en alakalı'
    ];

    let settings = loadSettings();
    let cleanupQueued = false;
    let started = false;

    function loadSettings() {
        try {
            const loaded = {
                ...DEFAULTS,
                ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            };

            if (!VALID_COLUMNS.includes(String(loaded.columns))) {
                loaded.columns = DEFAULTS.columns;
            }

            return loaded;
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        applyState();
    }

    function normalizeText(value) {
        return (value || '')
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

    function hideElement(element) {
        if (!element) return;
        element.classList.add('ytc-hidden');
    }

    function unhideElements() {
        queryAll('.ytc-hidden').forEach((element) => {
            element.classList.remove('ytc-hidden');
        });
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
        if (!settings.enabled || !settings.redirectShorts) return;

        if (location.pathname.startsWith('/shorts/')) {
            location.replace('https://www.youtube.com/feed/subscriptions');
        }
    }

    function hideShortsNavigation() {
        if (!settings.enabled) return;

        const navSelectors = [
            'ytd-guide-entry-renderer',
            'ytd-mini-guide-entry-renderer',
            'ytd-guide-collapsible-entry-renderer',
            'tp-yt-paper-item',
            'a[href="/shorts"]',
            'a[href^="/shorts"]',
            'a[title="Shorts"]',
            'a[aria-label="Shorts"]'
        ];

        queryAll(navSelectors.join(',')).forEach((item) => {
            const link = item.matches('a') ? item : item.querySelector('a');
            const href = link ? link.getAttribute('href') || '' : '';
            const title = normalizeText(
                item.getAttribute('title') ||
                item.getAttribute('aria-label') ||
                (link ? link.getAttribute('title') || link.getAttribute('aria-label') : '') ||
                ''
            );

            const text = normalizeText(item.innerText || item.textContent);

            const isShortsEntry =
                href === '/shorts' ||
                href.startsWith('/shorts') ||
                title === 'shorts' ||
                text === 'shorts';

            if (isShortsEntry) {
                hideElement(getCardContainer(item));
            }
        });
    }

    function hideShortsContent() {
        if (!settings.enabled) return;

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

        selectors.forEach((selector) => {
            queryAll(selector).forEach(hideElement);
        });

        queryAll('a[href^="/shorts/"], a[href="/shorts"], a[href*="youtube.com/shorts/"]').forEach((link) => {
            hideElement(getCardContainer(link));
        });
    }

    function hideShorts() {
        hideShortsNavigation();
        hideShortsContent();
    }

    function hideSubscriptionSections() {
        if (!settings.enabled || !isSubscriptionsPage()) return;

        queryAll('ytd-rich-section-renderer, ytd-reel-shelf-renderer').forEach((section) => {
            const text = normalizeText(section.innerText || section.textContent);

            if (BLOCKED_SUBSCRIPTION_TITLES.some((title) => text.includes(title))) {
                hideElement(section);
            }
        });
    }

    function cleanPage() {
        redirectShortsPage();

        if (!settings.enabled) {
            unhideElements();
            return;
        }

        hideShorts();
        hideSubscriptionSections();
    }

    function scheduleCleanup() {
        if (cleanupQueued) return;

        cleanupQueued = true;

        requestAnimationFrame(() => {
            cleanupQueued = false;
            cleanPage();
            ensureButton();
        });
    }

    function applyState() {
        const root = document.documentElement;

        root.dataset.ytcEnabled = settings.enabled ? 'true' : 'false';
        root.dataset.ytcColumns = settings.enabled ? settings.columns : 'off';

        updateButtonState();
        updateMenuState();

        if (!settings.enabled) {
            unhideElements();
        }

        scheduleCleanup();
    }

    function addStyles() {
        const css = `
            .ytc-hidden {
                display: none !important;
            }

            html[data-ytc-enabled="true"] ytd-reel-shelf-renderer,
            html[data-ytc-enabled="true"] ytd-rich-shelf-renderer[is-shorts],
            html[data-ytc-enabled="true"] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
            html[data-ytc-enabled="true"] ytd-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-enabled="true"] ytd-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-enabled="true"] ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
            html[data-ytc-enabled="true"] ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
            html[data-ytc-enabled="true"] ytd-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-enabled="true"] ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
            html[data-ytc-enabled="true"] yt-tab-shape[tab-title="Shorts"] {
                display: none !important;
            }

            html[data-ytc-columns="3"] { --ytc-columns: 3; }
            html[data-ytc-columns="4"] { --ytc-columns: 4; }
            html[data-ytc-columns="5"] { --ytc-columns: 5; }
            html[data-ytc-columns="6"] { --ytc-columns: 6; }

            html[data-ytc-enabled="true"] ytd-rich-grid-renderer {
                --ytd-rich-grid-items-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-posts-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-slim-items-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-game-cards-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-mini-game-cards-per-row: var(--ytc-columns) !important;
                --ytd-rich-grid-item-max-width: none !important;
                --ytd-rich-grid-item-min-width: 0 !important;
            }

            html[data-ytc-enabled="true"] ytd-rich-grid-renderer #contents > ytd-rich-item-renderer,
            html[data-ytc-enabled="true"] ytd-rich-grid-row #contents > ytd-rich-item-renderer {
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
                fill: currentColor;
                pointer-events: none;
            }

            #ytc-menu {
                position: fixed;
                top: 58px;
                right: 12px;
                z-index: 2147483647;
                width: 282px;
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
                margin-bottom: 10px;
                color: inherit;
            }

            .ytc-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 10px 0;
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

            .ytc-options {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
                margin-top: 8px;
            }

            .ytc-option {
                border: 1px solid rgba(0, 0, 0, .16);
                background: transparent;
                color: inherit;
                border-radius: 8px;
                padding: 7px 0;
                cursor: pointer;
                font-size: 12px;
                font-family: Roboto, Arial, sans-serif;
            }

            html[dark] .ytc-option {
                border-color: rgba(255, 255, 255, .16);
            }

            .ytc-option:hover {
                background: rgba(0, 0, 0, .06);
            }

            html[dark] .ytc-option:hover {
                background: rgba(255, 255, 255, .10);
            }

            .ytc-option[data-active="true"] {
                border-color: #3ea6ff;
                color: #3ea6ff;
                background: rgba(62, 166, 255, .12);
                font-weight: 600;
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

    function createTuneIcon() {
        const namespace = 'http://www.w3.org/2000/svg';

        const svg = document.createElementNS(namespace, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const path = document.createElementNS(namespace, 'path');
        path.setAttribute(
            'd',
            'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z'
        );

        svg.appendChild(path);

        return svg;
    }

    function createSwitchRow(title, help, settingKey) {
        const row = createNode('div', 'ytc-row');
        const textWrap = document.createElement('div');

        const label = createNode('div', 'ytc-label', title);
        const helpText = createNode('div', 'ytc-help', help);

        const button = createNode('button', 'ytc-switch');
        button.type = 'button';
        button.dataset.setting = settingKey;

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

    function createGridOptions() {
        const options = createNode('div', 'ytc-options');

        VALID_COLUMNS.forEach((value) => {
            const button = createNode('button', 'ytc-option', value);
            button.type = 'button';
            button.dataset.columns = value;

            button.addEventListener('click', (event) => {
                event.stopPropagation();
                settings.columns = value;
                saveSettings();
            });

            options.appendChild(button);
        });

        return options;
    }

    function ensureButton() {
        if (!document.body) return;
        if (document.getElementById('ytc-button-wrap')) return;

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
        button.appendChild(createTuneIcon());

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

        const title = createNode('div', 'ytc-title', 'YouTube Cleaner');

        const cleanerRow = createSwitchRow(
            'Cleaner',
            'Hide Shorts and unwanted sections',
            'enabled'
        );

        const redirectRow = createSwitchRow(
            'Redirect Shorts pages',
            'Send /shorts/ links to Subscriptions',
            'redirectShorts'
        );

        const gridLabel = createNode('div', 'ytc-label', 'Grid columns');
        gridLabel.style.marginTop = '12px';

        const gridOptions = createGridOptions();

        menu.appendChild(title);
        menu.appendChild(cleanerRow);
        menu.appendChild(redirectRow);
        menu.appendChild(gridLabel);
        menu.appendChild(gridOptions);

        document.body.appendChild(menu);

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;

            const clickedButton = event.target.closest('#ytc-button-wrap');
            const clickedMenu = event.target.closest('#ytc-menu');

            if (!clickedButton && !clickedMenu) {
                menu.hidden = true;
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

    function updateMenuState() {
        const menu = document.getElementById('ytc-menu');
        if (!menu) return;

        const enabledSwitch = menu.querySelector('[data-setting="enabled"]');
        const redirectSwitch = menu.querySelector('[data-setting="redirectShorts"]');

        if (enabledSwitch) {
            enabledSwitch.dataset.active = settings.enabled ? 'true' : 'false';
            enabledSwitch.setAttribute('aria-pressed', settings.enabled ? 'true' : 'false');
        }

        if (redirectSwitch) {
            redirectSwitch.dataset.active = settings.redirectShorts ? 'true' : 'false';
            redirectSwitch.setAttribute('aria-pressed', settings.redirectShorts ? 'true' : 'false');
        }

        menu.querySelectorAll('.ytc-option').forEach((option) => {
            option.dataset.active = option.dataset.columns === settings.columns ? 'true' : 'false';
        });
    }

    function start() {
        if (started) return;
        started = true;

        addStyles();
        applyState();

        const observer = new MutationObserver(scheduleCleanup);

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

        document.addEventListener('DOMContentLoaded', scheduleCleanup);

        setInterval(scheduleCleanup, 2000);
    }

    start();
})();
