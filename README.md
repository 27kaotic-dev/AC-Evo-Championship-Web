# AC EVO Championship Viewer

A web page that shows an AC EVO championship exactly as the desktop **AC EVO Championship Manager** does: the standings with coloured result cells, interactive points progression charts, every race with the full lap analysis, round summaries and driver profiles. Dark and light mode, works on phones.

It is a **viewer**. Importing results, editing, penalties and scoring all stay in the desktop program; this page only shows what you export from it.

## Putting a championship on the site

1. In the desktop program open the championship and choose **File > Export for the web viewer…**. That writes a file such as `thursday_league.web.json`.
2. Copy it into this repo's `data` folder. Keep the `.web.json` ending.
3. Push to GitHub. A small workflow rebuilds `data/index.json` (the list behind the **Champ Library** page) by itself, and the page shows the new championship a minute or so later. If you would rather not wait for it, run `python tools/make_index.py` first and push the changed `index.json` with the file.

To update a championship (new race results), export it again over the same file name and push. To keep a finished season, just leave its file where it is: every file in `data` is a card in the library, live ones first, finished ones after. Delete a file to remove its card.

With one championship the site opens straight on it; with two or more it opens on the library. A link to one championship is `…/?c=thursday_league.web.json`. Anyone can also press **Open file…** (or drop a file onto the page) to look at an export that is not in the repo; it is only shown in their own browser.

## What is in an export

- Standings (drivers and teams), points per race, drop-worst results, penalties and bonuses, **calculated by the desktop program**, so the page can not disagree with it.
- Points progression and championship position over the season.
- Per race: classification, result, every lap time and sector, best laps, consistency, sector bests, invalid laps, position / gap / pace graphs, driver data and (if imported) qualifying. The lap analysis is worked out in the browser from the lap times, with the same rules as the desktop program.

Drivers are given anonymous ids (`d1`, `d2` …) in the export. **Game / Steam ids are never written to it.** Driver names, team names, car names and the session details shown under *Session info* are, and so is the server name, so check the file before you publish a championship you would rather keep private. A public repo or GitHub Pages site is readable by anyone.

## Hosting on GitHub Pages

1. Create the repo on GitHub and push this folder to it.
2. **Settings > Pages**, set the source to the `main` branch and the `/ (root)` folder.
3. The site appears at `https://<your-name>.github.io/<repo-name>/`.

There is no build step and nothing to install: the page is plain HTML, CSS and JavaScript.

## Trying it on your own computer

Browsers will not load the data file from a plain `file://` page, so serve the folder:

```
python -m http.server 8000
```

then open <http://localhost:8000>. (`Open file…` works without a server.)

## Files

| | |
|---|---|
| `index.html`, `icon.svg` | the page |
| `css/style.css` | dark and light themes |
| `js/util.js` | formatting, DOM helpers, CSV download |
| `js/analysis.js` | lap analysis (best laps, consistency, sectors, laps led) |
| `js/chart.js` | the interactive line chart |
| `js/standings.js` | Standings and Points progression pages |
| `js/race.js` | race, round and driver pages |
| `js/library.js` | the Champ Library page |
| `js/app.js` | start-up, theme, loading files |
| `tools/make_index.py` | rebuilds `data/index.json` from the files in `data` |
| `.github/workflows/index.yml` | runs that on every push that touches `data` |
| `data/` | exported championships and `index.json` |

## Notes

- The three sample seasons (one finished, one live, one not started) are made-up data: invented drivers, no real game ids. Delete them when you add your own.
- When you change a script or the stylesheet, change the `?v=` number after it in `index.html` so visitors do not get a cached copy.
