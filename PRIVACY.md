# Paradigma privacy policy

_Last updated: 1 October 2026_

Paradigma helps you learn languages by showing the meaning and forms of
words on web pages. This policy explains what data it handles.

## In short

- **We don't collect anything.** There is no Paradigma server, account or
  database. The developer never receives, sees or stores your lookups, your
  settings, the pages you visit, or anything else about you.
- **Everything happens in your browser.** Your settings and recent lookups
  are kept in your own browser's storage, and you can delete them at any time.
- **Only what you look up leaves your browser**, and only to the two free
  services that answer it: kaikki.org (the dictionary) and MyMemory (machine
  translation). Your browser contacts them directly, only when you select
  something to look up.
- **No analytics, tracking, advertising or selling of data.** Nothing is
  shared with anyone else, for any purpose.

The rest of this page gives the details.

## What leaves your browser

When you look something up (by selecting text, the keyboard shortcut or the
context menu), **the selected text** and **its language** are sent to:

- **kaikki.org**, which provides the Wiktionary dictionary data. A request
  names the word being looked up, e.g. `kaikki.org/dictionary/French/…/manger.jsonl`.
  When you look up a word in your own language, its translations in the
  languages you're learning are looked up here too.
- **MyMemory** (api.mymemory.translated.net), which provides machine
  translation. It receives the text, up to 500 bytes, and the language pair
  (when translating from your own language, one request per language whose
  tab you open). A word in a language you're learning is only sent here if
  the dictionary doesn't explain it. MyMemory also receives your email
  address if you've chosen to give one (see below).
  See [MyMemory's privacy policy](https://mymemory.translated.net/doc/privacy.php).

These services also see what any website sees: your IP address and browser
details. Nothing else is sent. That excludes the page's address, the rest of
the page and your other settings. No identifier for you is sent, apart from
the optional email address below, and that only to MyMemory.

### Optional: your email address

MyMemory limits free translation to about 5,000 characters a day, or 50,000 a
day for requests that include an email address. You can enter one under
**Translation limit** on the settings page. It's optional, and nothing else
in the extension needs it.

- It's sent **only to MyMemory**, as part of every translation request, so
  MyMemory can apply the higher limit. kaikki.org and Wikimedia never receive it.
- It's stored with your other settings in `chrome.storage.sync` (see below).
- To remove it, clear the field on the settings page. It's then deleted from
  your settings and no longer sent.

Pronunciation audio, when you press **Listen**, is loaded from Wikimedia
(upload.wikimedia.org).

## What stays in your browser

- **Settings** (your language, the languages you're learning, the trigger,
  Spanish variety, per-site rules and the optional email address) are stored
  with `chrome.storage.sync`. If you use Chrome sync, Google syncs them between
  your browsers. The site rules name the sites you set them for.
- **Recent lookups** (the words and phrases you selected, and the dictionary
  entries and translations found for them) are saved in the browser's local
  extension storage (`chrome.storage.local`) for up to 30 days, so that
  looking the same thing up again doesn't repeat the requests. They're never
  sent anywhere and aren't synced. At most about 5 MB is kept; the oldest
  are removed first. To delete them, choose **Clear saved lookups** on the
  settings page; removing the extension deletes them too. Your email address
  is never saved with them.
- To decide whether a page is in a language you're learning, the extension
  reads the page's `lang` attribute and passes up to 8,000 characters of its
  text to Chrome's built-in, on-device language detection
  (`chrome.i18n.detectLanguage`). That text is not sent anywhere.

## What it doesn't do

- No analytics, tracking, advertising or accounts.
- No data is sold or transferred to anyone other than the two lookup services
  above, and only for performing the lookup you asked for (and, if you gave
  one, sending your email address to MyMemory for its higher limit).
- Nothing is used for creditworthiness, lending or any purpose unrelated to
  the extension's single purpose.

## Contact

Questions: use the developer contact email on the extension's Chrome Web
Store listing.
