# Reel Quiz

A Scene-It style quiz. Plays a short YouTube clip (start and end times), then asks a multiple choice question.

## Run
```bash
python3 -m http.server 8000
```
Open http://localhost:8000. Serve over http, not file://, or the YouTube player may refuse to load.

## Add clips
Use the **Clips** tab (stored in your browser, with JSON export/import), or seed `clips.js`.
Each clip: YouTube URL, start/end, question type, question, correct answer, 2-3 wrong answers.

## Notes
- Clips use the official YouTube IFrame player. Some uploads block embedding and will show an error.
- The controls are hidden and the clip auto-pauses at the end time. Players can still see the title if YouTube shows it on pause, so prefer uploads where the title is not a giveaway.
- Only embed videos you are entitled to use. Official studio trailers and channel clips are the safest source.
