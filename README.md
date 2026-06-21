<div align="center">

# YouTube Cleaner

### Bring back a cleaner old-school YouTube desktop layout.

No Shorts.  
No “Most relevant” section.  
No oversized 3-column desktop grid.

[![YouTube](https://img.shields.io/badge/YouTube-Cleaner-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscript-00485B?style=for-the-badge)](https://www.tampermonkey.net/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

[Install YouTube Cleaner](https://raw.githubusercontent.com/Tkremre/ytcleaner/main/YouTube-Cleaner.user.js)

</div>

---

## Introduction

YouTube Cleaner is a lightweight userscript made for people who prefer the older YouTube desktop browsing experience.

It focuses on the interface around the player, not the player itself.

The goal is simple:

- remove Shorts from the interface
- remove the “Most relevant” section from Subscriptions
- restore a denser desktop grid
- keep YouTube clean, simple, and easier to browse

If you miss the 2015–2016 style YouTube desktop experience, this script tries to bring a bit of that feeling back.

---

## Features

- Hide YouTube Shorts from the homepage, subscriptions, sidebar, and other common sections
- Hide the Shorts button from the left sidebar
- Redirect `/shorts/` pages back to Subscriptions
- Remove the “Most relevant” section from the Subscriptions page
- Change the desktop video grid layout
- Choose between 3, 4, 5, or 6 columns
- Add a small settings button in the YouTube top bar
- Save your settings locally in your browser

---

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [Recommended Settings](#recommended-settings)
4. [Common Issues](#common-issues)
5. [Update URL](#update-url)
6. [Contribution](#contribution)
7. [Disclaimer](#disclaimer)
8. [License](#license)

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

You should see a small settings icon in the YouTube top bar, near the Create and Notifications buttons.

---

## Usage

Click the YouTube Cleaner button in the YouTube top bar to open the settings menu.

Available settings:

- Enable or disable YouTube Cleaner
- Enable or disable Shorts page redirection
- Choose the grid layout:
  - 3 columns
  - 4 columns
  - 5 columns
  - 6 columns

Your settings are saved locally in your browser.

No account, server, or external service is used.

---

## Recommended Settings

For a desktop experience closer to older YouTube layouts:

- Cleaner: enabled
- Redirect Shorts pages: enabled
- Grid columns: 5

For large monitors, 6 columns can also work well.

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
- checking that no other YouTube script conflicts with it

If Shorts are still visible, open an issue with:

- your browser
- your YouTube language
- the page where Shorts still appear
- a screenshot if possible

---

### The grid layout does not change

Try switching to another column value and then switching back.

For example:

1. Set the grid to 4 columns
2. Refresh YouTube
3. Set the grid back to 5 columns

If it still does not work, another extension or userscript may be modifying YouTube’s layout.

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

## Contribution

Suggestions, bug reports, and improvements are welcome.

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

---

## Disclaimer

YouTube Cleaner is not affiliated with YouTube, Google, or Alphabet.

This script only modifies the YouTube interface locally in your browser.

---

## License

This project is licensed under the [MIT License](./LICENSE).
