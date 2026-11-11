YouTube Cleaner brings a quieter, denser layout to YouTube desktop. Pick the features you want from a compact settings panel in the top bar.

### Features

- Hide Shorts from feeds and navigation, and redirect `/shorts/` pages to the homepage
- Choose **Off, Dim, or Hide** for videos with a watch-progress indicator
- Optionally hide YouTube Mixes without hiding regular playlists
- Remove noisy sections from the Subscriptions page
- **Only subscribed uploaders**: optionally hide collaborations published by channels you do not follow, while keeping collaborations uploaded by subscribed channels
- Optionally hide upcoming premieres and scheduled live streams from Subscriptions
- Optionally hide YouTube Playables game shelves and sidebar entries
- Optionally hide grouped homepage recommendations, such as music selections
- Optionally hide clickable paid-promotion labels on thumbnail previews
- Use YouTube's automatic grid or choose **1 to 8 videos per row**
- Optionally show dislike counts with Return YouTube Dislike

### Settings

The panel has three tabs: **Videos**, **Subscriptions**, and **Layout**, with a master switch at the top. Settings are saved locally in your browser.

A small flask marks experimental options: subscribed-uploaders filtering, upcoming videos, and home shelves. Hover over the icon for an explanation. These features may need adjustments when YouTube changes.

The subscribed-uploaders filter is **disabled by default** and only runs on Subscriptions. If you follow a collaborator but not the channel that uploaded the video, the video is hidden. If the uploading channel is followed, the video stays visible. Videos that cannot be verified remain visible.

Watched-video filtering uses thumbnail progress indicators and is automatically disabled on History. Paid-promotion filtering applies to thumbnail previews.

### Privacy

Most features only change the interface locally. When enabled, **Only subscribed uploaders** reads your subscriptions and video metadata directly from YouTube using your existing session. Results are cached in memory and are not sent to a custom backend.

The optional dislike counter contacts the public Return YouTube Dislike API only when enabled. No separate account or custom backend is required.
