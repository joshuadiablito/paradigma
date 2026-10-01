# Test fixtures

These are responses from [kaikki.org](https://kaikki.org/), saved so the unit
tests run offline against real data. Some English ones are trimmed to the
translations into French, Spanish, Greek and German, to keep them small.

## Licence

The content is from [Wiktionary](https://en.wiktionary.org/), extracted by
[wiktextract](https://github.com/tatuylonen/wiktextract), and is licensed under
the [Creative Commons Attribution-ShareAlike 4.0 International
licence](https://creativecommons.org/licenses/by-sa/4.0/) (CC BY-SA 4.0). It is
not covered by the MIT licence that applies to the rest of this repository.

Authors: Wiktionary contributors. Each entry's history, which lists its
authors, is on its Wiktionary page, e.g.
<https://en.wiktionary.org/w/index.php?title=manger&action=history>.

## Adding one

```sh
curl https://kaikki.org/dictionary/Italian/meaning/p/pa/parlare.jsonl > test/fixtures/italian-parlare.jsonl
```

The URL pattern is `/dictionary/<Language>/meaning/<1st char>/<1st 2 chars>/<word>.jsonl`,
each part URL-encoded.
