# Releasing to the Chrome Web Store

How to publish Paradigma and ship updates. The Web Store dashboard changes
from time to time. If a field here doesn't match what you see, trust the
dashboard and update this page.

## Before the first release

### 1. Register as a Chrome Web Store developer (once)

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and sign in with the Google account that will own the extension.
2. Accept the developer agreement and pay the one-time registration fee.
3. Turn on **2-Step Verification** for the account. Publishing requires it.
4. Under **Account**, set the **contact email** and verify it. It's shown
   publicly on the listing, and the privacy policy points users to it.

### 2. Put the privacy policy at a public URL

The store needs a privacy policy URL, because the extension sends looked-up text
to kaikki.org and MyMemory. The policy is [PRIVACY.md](../PRIVACY.md), but
**this repository is private**, so its GitHub link won't work for reviewers.
Do one of the following:

- Make the repository public. The URL is then
  `https://github.com/joshuadiablito/paradigma/blob/main/PRIVACY.md`.
- Or publish the contents of `PRIVACY.md` somewhere public, such as a public
  gist or your own site, and use that URL.

Update the "Last updated" date in `PRIVACY.md` whenever what the extension
sends or stores changes. Update the store's privacy answers (below) at the same
time.

### 3. Prepare the listing images

| Asset              | Size                   | Source                                                          |
| ------------------ | ---------------------- | --------------------------------------------------------------- |
| Store icon         | 128 × 128 PNG          | `public/icons/icon-128.png`                                     |
| Screenshots (1–5)  | 1280 × 800 PNG or JPEG | `bun run build && bun run smoke` writes them to `smoke-output/` |
| Small promo tile   | 440 × 280 PNG or JPEG  | Not made yet; the dashboard shows whether it's required         |

The smoke test's screenshots (English word in French and Spanish, an English
phrase, French and Greek words) are the right size. They show the test page, so for a nicer listing,
take screenshots on a real site at the same size.

## Releasing a version

### 1. Set the version

The version must be higher than the last one uploaded; the store rejects
repeats. Change it in **both** files, which must match:

- `package.json` → `"version"`
- `public/manifest.json` → `"version"`

Use `major.minor.patch`, e.g. `0.1.0` → `0.2.0` for new features, → `0.1.1` for fixes.

### 2. Test

```sh
bun run build && bun run smoke
```

Then load `dist/` unpacked (see the README) and check by hand:

- double-click words and select phrases on a real English site, and on a site in each language you changed;
- the keyboard shortcut and Escape;
- the settings page and toolbar popup;
- a site in a language you're *not* learning, where nothing should happen.

### 3. Package

```sh
bun run package
```

This checks that the two versions match, runs `bun run check` (typecheck,
tests, production build), and writes `paradigma-<version>.zip` with
`manifest.json` at its root. The zip is gitignored.

### 4. Upload

**First release:**

1. In the dashboard, choose **Add new item** and upload the zip.
2. Fill in the tabs as described in [Listing](#listing-answers) and
   [Privacy practices](#privacy-practices-answers) below.
3. On **Distribution**, choose visibility. **Unlisted** is useful for a trial
   run: only people with the link can install it. Also choose the regions.
4. Click **Submit for review**.

**Updates:**

1. Open the item → **Package** → **Upload new package**, and choose the zip.
2. If you added a permission or host, or changed what data is sent, update
   the **Privacy practices** answers and `PRIVACY.md` too.
3. **Submit for review**.

Review usually takes a few days. Content scripts on every site (which this
extension needs) can mean a more thorough review. Users get the update
automatically after it's approved. Adding a permission makes Chrome disable
the extension until each user accepts the new permission, so avoid adding
permissions casually.

### 5. Tag the release

```sh
git tag v0.1.0
git push origin v0.1.0
```

## Listing answers

| Field       | Value                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Name        | From the manifest: Paradigma                                                                                       |
| Summary     | From the manifest's `description` (132 characters at most)                                                             |
| Category    | Education                                                                                                              |
| Language    | English                                                                                                                |

**Description** (edit as you like):

> Learning a language? Double-click any word as you read.
>
> On an English page, see it in every language you're learning, one tab each:
> dictionary translations by meaning, with gender and usage, and every form of
> the main translation. Select a phrase to translate it into each language.
>
> On a page in a language you're learning, see what a word means in English
> and every form it takes.
>
> • Meanings with examples and pronunciation, from Wiktionary
> • Hear it said: native speakers' recordings, or your computer's own voices
> • Which form you're looking at: "mange is the present tense of manger"
> • Full conjugation tables by person and number, with pronouns
> • Adjectives by gender, number and case; nouns by number and case
> • Spanish tables for Spain, Latin America or Río de la Plata (vos)
> • Greek tenses named by aspect: present, aorist, dependent, futures
> • Nothing happens until you select something; turn it off per site
> • Keyboard shortcut, and usable with a screen reader
>
> 24 languages, including French, Spanish, German, Italian, Portuguese, Greek, Māori,
> Dutch, Russian, Polish and Japanese.
>
> Private by design: there is no Paradigma server, and we collect nothing.
> Your settings and recent lookups stay in your browser. Only the words you
> choose to look up are sent, straight from your browser, to the free services
> that answer them. No account, no tracking, no ads.
>
> Dictionary data: Wiktionary via kaikki.org (CC BY-SA). Translation: MyMemory.

## Privacy practices answers

**Single purpose:**

> Shows words the user selects on web pages in the languages they are learning:
> translations with their grammatical forms (conjugations, declensions) for
> text in the user's own language, and meanings and forms for text in a
> language being learned.

**Permission justifications:**

| Permission                           | Justification                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                            | Saves the user's settings: the languages they're learning, translation language, how lookups are triggered, per-site on/off rules, and an optional email address for MyMemory's higher limit. Also keeps recent lookups' results on the device for up to 30 days, so repeating a lookup doesn't repeat its requests. |
| `contextMenus`                       | Adds "Look up …" to the right-click menu for selected text, for touch screens and for when automatic lookups are set to need Alt.                                                                              |
| `tts`                                | Reads a looked-up word or phrase aloud when the user presses Listen, using only the computer's on-device voices.                                                                                              |
| `offscreen`                          | Plays a native speaker's pronunciation recording from Wikimedia when the user presses Listen. Playing it from an extension page means a website's security policy can't block it.                            |
| Host `https://kaikki.org/*`          | Fetches the dictionary entry (meanings, pronunciation and inflection tables) for the word the user looks up.                                                                                                   |
| Host `https://api.mymemory.translated.net/*` | Fetches a translation of the word or phrase the user looks up.                                                                                                                                        |
| Content script on `http://*/*`, `https://*/*` | Language learners read any site, so the extension must be able to see what the user selects and show its popup on any page. It does nothing until the user selects text, and sends nothing but the selected text. |

**Remote code:** No. All code is in the package; kaikki.org and MyMemory
return data (JSON), which is displayed as text and never executed.

**Data usage:** tick these two:

- **Personally identifiable information**: the optional email address the
  user can enter in settings. It's provided by the user, stored in
  `chrome.storage.sync`, and sent only to MyMemory with translation requests,
  to raise MyMemory's free daily limit.
- **Website content**: the text the user looks up is sent to kaikki.org and
  MyMemory. Recent lookups and their results are also kept in
  `chrome.storage.local` for up to 30 days; that copy never leaves the
  device, so it adds nothing to these answers.

Nothing else applies: no health, financial, authentication, location or
communication data, and no browsing history or user-activity tracking.

Then certify the three statements:
- data isn't sold to third parties;
- it isn't used for purposes unrelated to the single purpose;
- it isn't used for creditworthiness or lending.

**Privacy policy URL:** see [step 2](#2-put-the-privacy-policy-at-a-public-url).

## Automating uploads (optional)

The [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)
can upload and publish from a script or CI, using an OAuth client and refresh
token. It isn't set up here; for occasional releases, the dashboard is simpler.
