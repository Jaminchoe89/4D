# Singapore 4D Pattern Lab

Local browser app for exploring historical Singapore 4D number patterns.

## What it does

- Parses pasted 4-digit history from a textarea.
- Imports local `.txt`, `.csv`, `.json`, and `.html` history files by extracting isolated 4-digit values.
- Preloads the full official 4D result history from Singapore Pools on page load, then caches the same-day snapshot in the browser.
- Scores all `0000` to `9999` combinations locally in the browser.
- Ranks a diversified shortlist using:
  - digit frequency by position
  - overall digit frequency
  - recent-window weighting
  - adjacent digit-pair trends
  - repetition-shape frequency

## Important note

This is a pattern-analysis tool, not a mathematically reliable way to predict a random lottery draw.

## Run

```bash
npm start
```

Then open `http://127.0.0.1:3084`.

## Deploy to Vercel

- Import the GitHub repository into Vercel.
- Keep the project root at the repository root.
- Vercel will serve the frontend from the `public/` directory.
- The official Singapore Pools fetch runs through `api/official-history.mjs`.
- `vercel.json` sets a longer execution window for the API route because importing many draws can take longer than a tiny default request window.
