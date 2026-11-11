<div align="center">

<h1><img src="./assets/youtube-cleaner.svg" alt="" width="36" height="36" align="top">&nbsp;YouTube Cleaner</h1>

### Bring back a cleaner old-school YouTube desktop layout.

No Shorts.<br>
No noisy subscription sections.<br>
More control over the desktop grid.

[![YouTube](https://img.shields.io/badge/YouTube-Cleaner-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?style=for-the-badge)](https://www.tampermonkey.net/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

[Install from GitHub](https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js)
[Install from Greasy Fork](https://greasyfork.org/fr/scripts/585208-youtube-cleaner-hide-shorts-clean-layout)

</div>

---

## Introduction

YouTube Cleaner is a lightweight userscript made for people who prefer the older YouTube desktop browsing experience.

It focuses on the interface around the player, not the player itself.

The goal is simple:

- remove Shorts from the interface
- remove noisy sections from Subscriptions
- restore a denser desktop grid when you want it
- keep YouTube clean, simple, and easier to browse

If you miss the 2015-2016 style YouTube desktop experience, this script tries to bring a bit of that feeling back.

---

## Features

- Hide YouTube Shorts from the homepage, subscriptions, sidebar, and other common sections
- Hide the Shorts button from the left sidebar
- Redirect `/shorts/` pages back to the YouTube homepage
- Remove "Most relevant", recommendations, and similar noisy blocks from the Subscriptions page
- Optionally hide scheduled premieres and live streams from Subscriptions until they start
- Optionally hide collaboration videos from Subscriptions when their uploading channel is not subscribed
- Choose whether to leave, dim, or hide videos with a watch-progress indicator
- Optionally hide auto-generated YouTube Mix playlists without hiding regular playlists
- Optionally hide YouTube Playables game shelves and sidebar entries
- Optionally hide grouped homepage recommendations, including music selections
- Optionally hide clickable paid-promotion labels on thumbnail previews
- Switch between automatic YouTube columns and a manual grid
- Use a slider from 1 to 8 video thumbnails per row
- Show dislike counts on watch pages with Return YouTube Dislike
- Add a cleaner-style settings button in the YouTube top bar
- Split settings into clear menu sections
- Save your settings locally in your browser

---

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [Recommended Settings](#recommended-settings)
4. [Privacy Notes](#privacy-notes)
5. [Common Issues](#common-issues)
6. [Update URL](#update-url)
7. [Changelog](#changelog)
8. [Contribution](#contribution)
9. [Disclaimer](#disclaimer)
10. [License](#license)

---

## Installation

### 1. Install Tampermonkey

If you do not already have Tampermonkey installed, install it for your browser:

- [Tampermonkey for Chrome](https://www.tampermonkey.net/?browser=chrome)
- [Tampermonkey for Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- [Tampermonkey for Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- [Tampermonkey for Opera / Opera GX](https://www.tampermonkey.net/?browser=opera)

### 2. Install the script

Click here and press **Install**:

[Install YouTube Cleaner](https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js)

### 3. Enable the script

Open the Tampermonkey Dashboard and make sure **YouTube Cleaner** is enabled.

### 4. Open YouTube

Go to:

[https://www.youtube.com](https://www.youtube.com)

Refresh the page.

You should see a small cleaner icon in the YouTube top bar, near the Create and Notifications buttons.

---

## Usage

Click the YouTube Cleaner button in the YouTube top bar to open the settings panel. The Cleaner switch stays at the top, and three tabs group the controls. Changes are saved automatically. Close the panel with the close button, Escape, or a click outside it; use the arrow keys to move between tabs.

Available settings:

- **Videos**
  - Hide or keep Shorts across feeds, navigation, and direct Shorts pages
  - Choose Off, Dim, or Hide for videos with a watch-progress indicator
  - Hide auto-generated YouTube Mix playlists from feeds, search results, and recommendations
  - Hide YouTube games (Playables shelves and sidebar entries)
  - Hide grouped home shelves, such as music selections
  - Hide paid-promotion labels on thumbnail previews
- **Subscriptions**
  - Enable or disable noisy subscription section hiding
  - Hide upcoming premieres and scheduled live streams until they start
  - Only subscribed uploaders: hide collaborations published by channels you do not follow, while keeping collaborations uploaded by subscribed channels
- **Layout**
  - Use YouTube automatic columns
  - Choose 1 to 8 thumbnails per row with the slider
  - Enable or disable dislike counts on watch pages

Your settings are saved locally in your browser.

A small amber flask marks **experimental** options: home shelves, upcoming videos, and subscribed-uploaders filtering. Hover over the flask for the reason. These features depend on YouTube layouts or internal metadata that can vary between accounts and change over time.

Watched-video detection uses the progress indicator shown on YouTube thumbnails. Videos without that indicator remain visible, even if they appear in your watch history. The watched-video filter is automatically disabled on History, while your saved Off / Dim / Hide preference still applies on other pages.

The games, home shelves, and promotion-label filters are disabled by default. Home shelf filtering only affects grouped video recommendations on the homepage; channel pages and search results are unaffected. Shorts and Playables remain controlled by their own settings. Promotion-label filtering affects thumbnail previews and leaves the disclosure in the main video player visible.

No separate account or custom backend is required by YouTube Cleaner. The optional subscription filter uses your existing YouTube session.

---

## Recommended Settings

For a desktop experience closer to older YouTube layouts:

- Cleaner: enabled
- Hide Shorts: enabled
- Watched videos: Dim (or Hide if you prefer not to see them at all)
- Hide YouTube Mixes: optional
- Hide noisy subscription sections: enabled
- Hide upcoming videos: optional
- Automatic grid: disabled
- Manual columns: 5

For large monitors, 6 to 8 columns can also work well.

If YouTube changes its grid again, try enabling Automatic grid first.

---

## Privacy Notes

Most features run entirely in your browser and only change the local YouTube interface.

The optional **Only subscribed uploaders** filter is disabled by default and only runs on Subscriptions. It reads your complete subscription list from YouTube, including continuation pages, and requests only the video ID and uploading channel ID for collaboration videos. A complete watch page is fetched only as a fallback when the lightweight metadata is unavailable. It does not guess from display names or require every collaborator to be subscribed. These requests go directly to YouTube using your existing session; fetched pages are parsed as data without executing their scripts or starting playback.

At most two video metadata requests run at once. Subscription and uploader results stay in memory for up to five minutes and are cleared when the filter is disabled or you leave Subscriptions. Toggle the filter off and on, or refresh the page, to update it immediately after changing subscriptions. Missing metadata, incomplete subscription lists, and request failures leave videos visible. No subscription list is stored in local storage or sent to another service.

The status below **Only subscribed uploaders** shows whether channels or uploaders are being checked, how many collaboration videos were hidden, and whether verification failed. The filter checks the channel that uploaded the video; following another collaborator does not keep the video in the feed.

The **Show dislikes** option calls the public [Return YouTube Dislike](https://returnyoutubedislike.com/) API for the current video ID. Keep it disabled if you do not want the script to make that external request.

When dislikes are enabled, YouTube Cleaner keeps YouTube's native like/dislike buttons and injects the Return YouTube Dislike count into the original dislike button.

The dislike count refreshes regularly and stays in a compact YouTube-style format.

---

## Common Issues

### The settings button does not appear

Try refreshing YouTube first.

If it still does not appear:

- make sure Tampermonkey is installed
- make sure YouTube Cleaner is enabled in the Tampermonkey Dashboard
- make sure the script is installed for `youtube.com`
- try disabling other YouTube-related userscripts or extensions

---

### Shorts are still visible

YouTube changes its interface often, and some layouts can vary depending on language, region, account, or A/B testing.

Try:

- refreshing the page
- opening YouTube in a new tab
- checking that YouTube Cleaner is enabled
- checking that Hide Shorts is enabled
- checking that no other YouTube script conflicts with it

If Shorts are still visible, open an issue with:

- your browser
- your YouTube language
- the page where Shorts still appear
- a screenshot if possible

---

### The grid layout does not change

Try switching Automatic grid off, then move the slider to another value.

If it still does not work, another extension or userscript may be modifying YouTube's layout.

---

### Dislikes do not appear

Make sure Show dislikes is enabled and that you are on a regular `/watch?v=...` video page.

If it still does not appear:

- refresh the page
- check that Tampermonkey allows `returnyoutubedislikeapi.com`
- check whether another YouTube extension changes the like button area

---

### The menu opens but looks broken

YouTube may change its theme variables or layout.

Try:

- refreshing the page
- switching YouTube between dark and light mode
- disabling other YouTube interface extensions

If the issue continues, open an issue with a screenshot.

---

### The menu does not open

This script avoids using `innerHTML` because YouTube may enforce Trusted Types security rules.

If the menu does not open:

1. Open the browser console
2. Click the YouTube Cleaner button
3. Copy the error message
4. Open an issue with the error

---

## Update URL

YouTube Cleaner is configured to update from GitHub.

Userscript URL:

```txt
https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
```

The userscript header uses:

```js
// @updateURL    https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js
```

Make sure the script file is named exactly:

```txt
YouTube-Cleaner.user.js
```

---

## Changelog

### 1.4.1

- Added French script name and description metadata so Greasy Fork accepts the French presentation
- Added French presentation and release text, plus combined 1.4.0 / 1.4.1 changelogs for Greasy Fork

### 1.4.0

- Redesigned settings with three tabs, a persistent master switch, clear close controls, and light/dark themes
- Marked experimental options with a discreet flask icon and an accessible explanation
- Added an optional **Only subscribed uploaders** filter to Subscriptions, keeping collaborations when the actual uploading channel is subscribed
- Matched channel IDs against the complete subscription list instead of comparing displayed names or hiding every collaboration
- Kept uploader checks lightweight with minimal metadata requests, in-memory caching, and a watch-page fallback
- Loaded complete subscription lists while distinguishing pagination from YouTube's sort commands
- Kept unverified videos visible and added readable filter status and diagnostic codes
- Added regression coverage for uploader matching, metadata failures, and accessible settings controls

### 1.3.0

- Excluded History from watched-video dimming and hiding, including navigation without a page reload
- Added optional filters for YouTube Playables and grouped homepage video shelves, including music selections
- Added an optional filter for clickable paid-promotion labels on thumbnail previews, preserving other preview controls
- Added browser regression checks for page navigation, independent filters, and settings persistence

### 1.2.0

- Replaced the two watched-video switches with an **Off / Dim / Hide** slider, preserving saved choices
- Added an optional **Hide YouTube Mixes** setting without affecting regular playlists
- Added an optional Subscriptions filter for upcoming videos
- Extended watched-video handling to compact video cards and both supported progress-overlay renderers
- Reclassified Shorts cards when YouTube changes their links, and hid collapsible Shorts navigation entries completely
- Corrected the settings button's accessibility state so it only reports whether its menu is open

### 1.1.0

- Added an optional **Dim watched videos** setting based on YouTube's watch-progress renderers
- Simplified Shorts controls to a single setting covering feeds, navigation, and direct Shorts pages
- Switched subscription cleanup to renderer-based detection without translated title lists
- Reduced repeated DOM work by combining Shorts selectors and debouncing mutation-driven cleanup
- Removed the periodic full-page cleanup scan and paused cleanup work while the tab is hidden
- Isolated cleanup features so one selector failure no longer prevents the settings button or other features from working
- Restored the settings button automatically if YouTube removes it during navigation
- Prevented script-generated DOM updates from retriggering unnecessary cleanup work
- Added stricter settings validation and automatic migration from earlier settings formats
- Improved menu accessibility with switch semantics, focus styles, Escape handling, and expanded-state attributes
- Limited the in-memory dislike cache and kept background dislike refreshes inactive in hidden tabs
- Removed obsolete compact-count parsing and cleanup code from the retired replacement reaction buttons
- Prevented a previous video's dislike count from remaining visible while a new count loads
- Prevented the userscript from running inside frames
- Kept the userscript version aligned with this release at `1.1.0`

### 1.0.2

- Fixed the dislike counter placement by keeping YouTube's native reaction buttons
- Removed the replacement like/dislike button group
- Removed the compact/full count option after it proved too fragile on YouTube's current layout
- Kept the dislike count in a compact YouTube-style format
- Added regular dislike count refresh without touching the native like counter
- Kept the userscript version aligned with this release at `1.0.2`

### 1.0.1

- Added separated menu sections for General, Shorts, Subscriptions, Layout, and Extras
- Added independent toggles for Shorts hiding, subscription cleanup, and dislikes
- Added more blocked subscription section titles and normalized accent handling
- Replaced fixed column buttons with Automatic grid plus a 1 to 8 column slider
- Added optional Return YouTube Dislike counts on watch pages with replacement reaction buttons
- Improved replacement reaction button animation and optimistic count updates
- Added regular reaction counter refresh
- Replaced the top bar tune icon with a cleaner-style icon
- Kept the userscript version aligned with this release at `1.0.1`

### 1.0.0

- Initial public release
- Hide YouTube Shorts across the interface
- Hide the Shorts button from the left sidebar
- Redirect `/shorts/` pages back to Subscriptions
- Remove the "Most relevant" section from the Subscriptions page
- Add a small settings button in the YouTube top bar
- Choose between 3, 4, 5, or 6 video columns
- Save settings locally in the browser
- Support YouTube dark and light themes

---

## Contribution

Suggestions, bug reports, and improvements are welcome.

Run the dependency-free userscript checks with `node --test` before submitting changes.

For browser checks, `tests/browser-regressions.cjs` exports an async function accepting a Playwright `page` and the userscript source. It runs on an isolated fixture page and checks History navigation, filter independence, preview clicks, and saved settings.

`tests/collaborations.browser.cjs` uses the same interface and checks uploader matching, paginated subscriptions, incomplete data, request cancellation, and filtering only on Subscriptions.

You can contribute by opening an issue or creating a pull request.

Useful bug reports include:

- browser name and version
- operating system
- YouTube language
- screenshot of the issue
- page URL where the issue happens
- console error if there is one

Useful ideas include:

- better selectors for hiding Shorts
- support for more YouTube languages
- cleaner UI improvements
- better grid handling for unusual screen sizes
- better selectors for YouTube UI cleanup

---

## Disclaimer

YouTube Cleaner is not affiliated with YouTube, Google, or Alphabet.

This script only modifies the YouTube interface locally in your browser.

---

## License

This project is licensed under the [MIT License](./LICENSE).
