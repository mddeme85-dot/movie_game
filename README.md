# Reel Quiz

Scene-It style quiz. A YouTube clip plays, pauses at a set point and asks a question. Answer, then the rest of the clip plays and an end card shows Correct or Incorrect.

## Run
```bash
python3 -m http.server 8000
```
Open http://localhost:8000 (serve over http, not file://).

## Modes and scoring
- Easy: four choices (needs 2-3 wrong answers on the clip).
- Hard: type or speak (Chrome/Edge/Safari speech recognition; fuzzy matched, so small typos and "my" vs no "my" are fine).
- 15 seconds to answer. Correct = 100. Answered within 5 seconds = +50. Hard mode points are multiplied by 3 (300, or 450 with the speed bonus). A beep sounds each second for the last 5 seconds (higher on the last); toggle on the start screen. Tune in `CFG` at the top of `game.js`.

## Adding clips
Clips tab (saved in the browser, export/import JSON), or edit `clips.js` (fields documented at the top).
`pauseAt` is where the question appears; `end` is optional (blank plays to the end of the video).

## Adding a question type
Add one entry to `QUESTION_TYPES` in `questions.js` (label, default prompt, hint, check function). It appears in the editor automatically.

## Notes
- Some YouTube uploads block embedding. The game shows "Video unavailable" and skips scoring for that round.
- Speech recognition in Chrome sends audio to Google's service.

## Hiding the title and subtitles
- A black strip covers the top of the video (`titleMaskPct` in `CFG`, default 12%) so YouTube's title bar cannot reveal the answer.
- YouTube captions are switched off. Subtitles burned into the picture cannot be removed, so set `maskBottom` (percent) on the clip, or "Hide bottom %" in the editor.
