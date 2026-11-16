<div align="center">

<h1><img src="./assets/youtube-cleaner.svg" alt="" width="36" height="36" align="top">&nbsp;YouTube Cleaner</h1>

### You came for the videos.

A few useful settings for the page around them.

[![YouTube](https://img.shields.io/badge/YouTube-Cleaner-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?style=for-the-badge)](https://www.tampermonkey.net/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

[Install from GitHub](https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js)
[Install from Greasy Fork](https://greasyfork.org/fr/scripts/585208-youtube-cleaner-hide-shorts-clean-layout)

</div>

---

## Introduction

YouTube Cleaner adds a small settings menu to YouTube on desktop. Hide the sections you keep scrolling past, adjust the grid, or keep the video on screen while you read the comments.

You can use it just to remove Shorts. You can also keep recommendations, leave the player alone, and use YouTube's automatic grid. There is no need to turn everything on.

The site stays familiar. Cleaner gives you a few more choices about what surrounds your videos, with settings saved in your browser.

---

## Features

### Clear the feed

- Hide Shorts across feeds and navigation, and redirect `/shorts/` pages to Home
- Remove extra blocks from Subscriptions, or recognized recommendation sections from Home and search
- Leave watched videos alone, dim them, or hide them; History stays untouched
- Hide Mixes, Playables, or membership-badged videos
- Filter video titles with your own words or phrases and choose the pages affected
- Hide upcoming videos from Subscriptions, or collaborations uploaded by channels you do not follow

### Arrange the page

- Keep YouTube's automatic grid or choose 1 to 8 videos per row
- Hide clickable paid-promotion labels on previews and in the floating player
- Open all settings from the broom button in the top bar; your choices are saved locally

### Keep watching

- Keep the original player in view while reading comments, with a movable, resizable floating view that remembers its position
- Scroll the right-hand recommendations without moving the video or comments, in the normal two-column watch layout
- Hide end cards covering the final seconds without losing subtitles or playback controls
- Optionally add Return YouTube Dislike counts to YouTube's own dislike button

Most extras are off by default. Some filters depend on YouTube layouts or metadata that can change; a small flask in the settings marks these experimental options. [Usage](#usage) explains what each one does and where it applies.

---

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [Where to Start](#where-to-start)
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

Click the YouTube Cleaner button in the YouTube top bar to open the settings panel. The Cleaner switch stays at the top, and four tabs group the controls. Changes are saved automatically. Close the panel with the close button, Escape, or a click outside it; use the arrow keys to move between tabs. The menu remembers the last tab while YouTube stays open, and each tab keeps its own scroll position.

Available settings:

- **Browse**
  - Hide or keep Shorts across feeds, navigation, and direct Shorts pages
  - Choose Off, Dim, or Hide for videos with a watch-progress indicator
  - Use YouTube automatic columns or choose 1 to 8 thumbnails per row
  - Hide YouTube games (Playables shelves and sidebar entries)
  - Hide grouped home shelves, such as music selections
  - Clean recognized recommendation sections from search results
- **Subscriptions**
  - Enable or disable noisy subscription section hiding
  - Hide upcoming premieres and scheduled live streams until they start
  - Only subscribed uploaders: hide collaborations published by channels you do not follow, while keeping collaborations uploaded by subscribed channels
- **Filters**
  - Hide auto-generated YouTube Mix playlists without hiding regular playlists
  - Hide all membership-badged videos, even if you have access to them
  - Filter video titles with a personal word list and page choices
- **Player**
  - Enable the floating player while scrolling through a watch page
  - Scroll recommendations independently in the normal two-column watch layout
  - Hide end cards without hiding playback controls or subtitles
  - Hide paid-promotion labels on thumbnail previews and the floating player
  - Enable or disable dislike counts on watch pages

Your settings are saved locally in your browser.

A small amber flask marks **experimental** options: home shelves, upcoming videos, subscribed-uploaders filtering, the floating player, independent recommendations, search-section cleanup, and members-only filtering. Hover over the flask for the reason. These features depend on YouTube layouts or internal metadata that can vary between accounts and change over time.

**Clean search results** only hides recognized recommendation headings in English and French, such as “People also watched”, “For you”, and “Explorer davantage”. Regular video, channel, and playlist results stay intact; unknown sections are left visible. **Hide end cards** removes the cards over the final seconds and their Hide button, not subtitles, playback controls, or the promotion disclosure.

**Hide members-only videos** uses YouTube's membership badges, not title words or your subscription list. It hides all recognized members-only cards, including videos you could access through a paid membership. Unmarked videos remain visible. History is always excluded, and nothing changes your actual memberships or access rights.

**Filter video titles** is under **Filters → Title filters**. Expand **Edit words and pages** and enter one word or phrase per line. Matching uses literal title fragments, ignoring case and accents; punctuation is literal, not regular-expression syntax. Descriptions, channel names, comments, playlists, and channel cards are not matched. Choose Home, Subscriptions, Search, Related videos, and/or Channel pages. Only Home and Subscriptions are selected initially; History is always excluded. Empty lists hide nothing. The list and page choices are saved locally, even while the filter or master switch is off.

**Floating player** is disabled by default and available under **Player → While watching**. Once the playing video's original position has scrolled above the header, it initially floats at the bottom-right of the main column, just left of the recommendations. If no separate right-hand column is available, it uses the window's bottom-right corner. Scrolling back restores it. Hover to reveal YouTube-style circular controls: use the move handle to drag the player, drag any corner to resize without changing its aspect ratio, or use the reset button to return to the default size and placement. A saved personal layout takes priority over the default. The return and dismiss buttons do not pause playback; after dismissal, scrolling back to the original player allows it to float again. Actions also stay visible when focused from the keyboard, but moving and resizing are mouse-only. Escape cancels an ongoing drag.

The chosen size and relative position are saved locally on release and reused for subsequent videos and page loads. A smaller window temporarily clamps the player inside the viewport without overwriting your preferred layout. Corners stay rounded in both default and theater layouts. Resize corners use a subtle hover cue instead of permanent icons. Hover explanations use YouTube-style player tooltips, not browser title popups.

This uses the original YouTube player, not a second video or an operating-system PiP window, and makes no additional requests. The frame adapts to the browser viewport and preserves portrait and ultrawide videos without cropping. Default and theater layouts are supported. It stays out of fullscreen, native PiP, and YouTube's own miniplayer, and is suspended in windows narrower than 640 CSS pixels or shorter than 400 CSS pixels. Unknown player layouts are left untouched.

**Independent recommendations**, also under **Player → While watching**, is off by default. In the normal two-column watch layout, recommendations get a vertical-only scroll area that stays accessible beside the main column. Scrolling inside the list does not move the video or comments, even at the list's ends; move the pointer to the main column to scroll the page. No horizontal scrollbar is added. YouTube can still load more recommendations normally. The option leaves theater/fullscreen, stacked narrow layouts, and sidebars occupied by a playlist, live chat, or another panel unchanged. Disabling it or leaving the watch page restores the original sidebar. This feature changes only the layout and does not request data itself.

Watched-video detection uses the progress indicator shown on YouTube thumbnails. Videos without that indicator remain visible, even if they appear in your watch history. The watched-video filter is automatically disabled on History, while your saved Off / Dim / Hide preference still applies on other pages.

The games, home shelves, and promotion-label filters are disabled by default. Home shelf filtering only affects grouped video recommendations on the homepage; channel pages and search results are unaffected. Shorts and Playables remain controlled by their own settings. Promotion-label filtering affects thumbnail previews and the floating player, and leaves the disclosure in the full-size video player visible.

No separate account or custom backend is required by YouTube Cleaner. The optional subscription filter uses your existing YouTube session.

---

## Where to Start

Start with the part of YouTube that bothers you:

- If you keep scrolling past Shorts or extra Subscription sections, start with those filters.
- If the homepage feels too spread out, try a manual grid. Five columns is a starting point; YouTube's automatic layout is still available.
- If you lose sight of the video when opening the comments, try the floating player. Its size and position are yours to adjust.
- If you want to browse suggestions without moving the page, try independent recommendations in the normal two-column view.

Change one thing at a time and keep what helps. The title filters and other extras can wait until you need them.

You can pause Cleaner with the main switch without losing your settings.

---

## Privacy Notes

Most features run entirely in your browser and only change the local YouTube interface.

Search cleanup, end-card hiding, members-only hiding, and title filters use the page already loaded by YouTube. They make no additional requests. Your blocked words stay in your browser and are not sent to YouTube or another service.

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

### 1.5.0

- Regrouped settings into Browse, Subscriptions, Filters, and Player, keeping common controls on the first tab and remembering each tab's scroll position
- Updated the presentation around feed cleanup, layout choices, and playback tools, keeping the YouTube Cleaner name and broom logo
- Added optional independent vertical scrolling for recommendations in the normal two-column watch layout, without scroll chaining or a horizontal scrollbar
- Added optional search-section cleanup for recognized English and French recommendation headings, preserving regular results
- Added optional end-card hiding while keeping playback controls and subtitles
- Added optional membership-badge filtering, with History excluded and no membership lookup
- Added literal title-word filtering with a local multiline editor and per-page choices, excluding Search by default and History always
- Added an optional floating player with mouse dragging, aspect-preserving resizing, local size/position memory, and return, dismiss, and reset controls
- Placed the floating player left of recommendations by default, with responsive sizing and rounded corners in both normal and theater layouts
- Matched hover controls and tooltips to YouTube's player, while keeping the original video and playback controls
- Extended promotion-label hiding to the floating view, leaving the full-size player's disclosure visible
- Kept saved settings and custom player layouts, and left new options off by default

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
