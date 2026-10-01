# Lekseis Hover privacy policy

_Last updated: 1 October 2026_

Lekseis Hover helps you learn languages by showing the meaning and forms of
words on web pages. This policy explains what data it handles.

## What leaves your browser

When you look something up (by selecting text, the keyboard shortcut or the
context menu), **the selected text** and **its language** are sent to:

- **kaikki.org**, which provides the Wiktionary dictionary data. A request
  names the word being looked up, e.g. `kaikki.org/dictionary/French/…/manger.jsonl`.
  When you look up a word in your own language, its translations in the
  languages you're learning are looked up here too.
- **MyMemory** (api.mymemory.translated.net), which provides machine
  translation. It receives the text, up to 500 bytes, and the language pair:
  one request per language you're learning, when translating from your own.
  See [MyMemory's privacy policy](https://mymemory.translated.net/doc/privacy.php).

These services also see what any website sees: your IP address and browser
details. Nothing else is sent. That excludes the page's address, the rest of
the page, your settings, and any identifier for you.

Pronunciation audio, when you press **Listen**, is loaded from Wikimedia
(upload.wikimedia.org).

## What stays in your browser

- **Settings** (your language, the languages you're learning, the trigger,
  Spanish variety and per-site rules) are stored with `chrome.storage.sync`. If you use
  Chrome sync, Google syncs them between your browsers. The site rules name the
  sites you set them for.
- **Recent lookups** are cached in memory to avoid repeat requests. They are
  discarded when Chrome stops the extension's service worker.
- To decide whether a page is in a language you're learning, the extension
  reads the page's `lang` attribute and passes up to 8,000 characters of its
  text to Chrome's built-in, on-device language detection
  (`chrome.i18n.detectLanguage`). That text is not sent anywhere.

## What it doesn't do

- No analytics, tracking, advertising or accounts.
- No data is sold or transferred to anyone other than the two lookup services
  above, and only for performing the lookup you asked for.
- Nothing is used for creditworthiness, lending or any purpose unrelated to
  the extension's single purpose.

## Contact

Questions: use the developer contact email on the extension's Chrome Web
Store listing.
