// Question type registry and answer matching.
//
// ADDING A QUESTION TYPE: add one entry to QUESTION_TYPES below. It then shows up in the
// clip editor dropdown automatically and works in both Easy and Hard mode.
//   label   : shown in the editor
//   prompt  : default question text (can be overridden per clip)
//   hint    : placeholder shown in the Hard mode answer box
//   check   : (given, acceptedAnswers[]) => boolean, used in Hard mode.
//             Pick one of Match.text | Match.person | Match.character | Match.exact, or write your own.
(function (root) {
  const norm = s => String(s == null ? "" : s).toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim();

  function lev(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const sim = (a, b) => (!a.length && !b.length) ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length);

  const FULL = 0.8;   // similarity needed for a full-answer match
  const TOKEN = 0.85; // similarity needed when matching a single name token

  const tokenMatch = (g, n, which) => {
    const toks = n.split(" ").filter(t => t.length >= 4);
    const pool = which === "last" ? toks.slice(-1) : toks;
    return pool.some(t => sim(g, t) >= TOKEN);
  };

  const Match = {
    norm, lev, sim,
    // Fuzzy match on the whole answer (lines of dialogue, titles).
    text: (given, accepted) => { const g = norm(given); return !!g && accepted.some(a => sim(g, norm(a)) >= FULL); },
    // Full name, or just the surname ("Hitchcock").
    person: (given, accepted) => { const g = norm(given); return !!g && accepted.some(a => { const n = norm(a); return sim(g, n) >= FULL || tokenMatch(g, n, "last"); }); },
    // Full name, or any single name ("Rhett").
    character: (given, accepted) => { const g = norm(given); return !!g && accepted.some(a => { const n = norm(a); return sim(g, n) >= FULL || tokenMatch(g, n, "any"); }); },
    // Exact after normalising (years, numbers).
    exact: (given, accepted) => { const g = norm(given); return !!g && accepted.some(a => norm(a) === g); },
  };

  const QUESTION_TYPES = {
    next_line:    { label: "Next line",      prompt: "What is the next line?",           hint: "Type or say the line",  check: Match.text },
    release_year: { label: "Release year",   prompt: "What year was this film released?", hint: "e.g. 1994",             check: Match.exact },
    director:     { label: "Director",       prompt: "Who directed this film?",          hint: "Director's name",       check: Match.person },
    character:    { label: "Character name", prompt: "What is this character called?",   hint: "Character's name",      check: Match.character },
    actor:        { label: "Actor",          prompt: "Who plays this character?",        hint: "Actor's name",          check: Match.person },
    title:        { label: "Film title",     prompt: "Which film is this?",              hint: "Film title",            check: Match.text },
    other:        { label: "Other",          prompt: "",                                  hint: "Your answer",           check: Match.text },
  };

  root.Match = Match;
  root.QUESTION_TYPES = QUESTION_TYPES;
  if (typeof module !== "undefined") module.exports = { Match, QUESTION_TYPES };
})(typeof window !== "undefined" ? window : globalThis);
