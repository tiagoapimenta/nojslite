# NoJSLite

NoJSLite is a lightweight Firefox extension that lets you control JavaScript per domain. It applies settings to the whole tab based on the tab's URL - including frames and embedded content from other domains.

Features:
- Per-domain JavaScript blocking/allowing for each tab.
- Temporary allow per tab: keep JavaScript enabled while you browse in that tab, and automatically revert when the tab is closed.
- Cookie control (passive): prevents blocked pages from sending or setting cookies at the request level from the moment blocking is active. It does not delete cookies already stored or remove them when permissions change.
