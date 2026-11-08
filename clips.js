// Built-in clips. Clips you add in the Clips tab are stored in your browser and merged with these.
//
// Fields
//   url      YouTube link
//   start    seconds (or "m:ss") where playback begins
//   pauseAt  where the clip stops and the question appears
//   end      optional. Where playback stops after the answer. Omit to play to the end of the video.
//            Set equal to pauseAt to skip the "rest of the clip".
//   type     a key from QUESTION_TYPES in questions.js
//   prompt   optional, overrides the type's default question
//   answer   the correct answer (shown on the end card; Easy mode choice)
//   accept   optional extra answers accepted in Hard mode
//   wrong    2 to 3 wrong answers for Easy mode
window.SEED_CLIPS = [
  {
    url: "https://www.youtube.com/watch?v=qd2887hknyU",
    start: 0, pauseAt: 25,
    type: "next_line", prompt: "What is the next line?",
    answer: "Frankly dear, I don't give a damn.",
    accept: ["Frankly, my dear, I don't give a damn."],
    // Distractors are famous lines from 1939 to 1942: Casablanca, The Wizard of Oz, Casablanca.
    wrong: ["Here's looking at you, kid.", "There's no place like home.", "Round up the usual suspects."],
  },
];
