(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const QT = window.QUESTION_TYPES;
  const CFG = { timeLimit: 15, bonusWindow: 5, base: 100, bonus: 50, hardMultiplier: 3 };

  // ---------- helpers ----------
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const parseTime = s => { s = String(s).trim(); if (s.includes(":")) return s.split(":").map(Number).reduce((a, b) => a * 60 + b, 0); return Number(s); };
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const videoId = u => { const m = String(u).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };
  const typeKey = t => QT[t] ? t : (Object.keys(QT).find(k => QT[k].label.toLowerCase() === String(t).toLowerCase()) || "other");

  // ---------- clip storage ----------
  const KEY = "reelquiz.clips";
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {} };
  const seeds = () => (window.SEED_CLIPS || []).map(c => ({ ...c, seed: true }));

  function normClip(c) {
    const start = parseTime(c.start || 0);
    const end = c.end === undefined || c.end === null || c.end === "" ? null : parseTime(c.end);
    const pauseAt = parseTime(c.pauseAt !== undefined && c.pauseAt !== "" ? c.pauseAt : c.end);
    return { ...c, type: typeKey(c.type), start, pauseAt, end, wrong: c.wrong || [], accept: c.accept || [] };
  }
  const allClips = () => [...seeds(), ...mine].map(normClip)
    .filter(c => videoId(c.url) && c.answer && Number.isFinite(c.pauseAt) && c.pauseAt > c.start);
  const clipsFor = mode => allClips().filter(c => mode === "hard" || c.wrong.length >= 2);

  // ---------- game state ----------
  let mode = "easy", deck = [], idx = 0, score = 0;
  let stage = "idle"; // idle | intro (playing to pause point) | asking | after (playing the rest) | done
  let cur = null, result = null, tStart = 0, tInt = null, tick = null, tapTimer = null, token = 0;

  const modeValue = () => document.querySelector('input[name="mode"]:checked').value;

  // ---------- tabs ----------
  function show(which) {
    $("view-play").hidden = which !== "play"; $("view-edit").hidden = which !== "edit";
    $("nav-play").classList.toggle("active", which === "play"); $("nav-edit").classList.toggle("active", which === "edit");
    if (which === "edit") { abortGame(); renderList(); } else refreshStart();
  }
  $("nav-play").onclick = () => show("play");
  $("nav-edit").onclick = () => show("edit");

  // ---------- YouTube player ----------
  let player = null, apiReady = false, apiFailed = false, onApi = [];
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = () => { apiFailed = true; };
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => { apiReady = true; onApi.forEach(f => f()); onApi = []; };
  const withApi = fn => (apiReady ? fn() : onApi.push(fn));
  const pt = () => { try { return player && player.getCurrentTime ? player.getCurrentTime() : 0; } catch (e) { return 0; } };
  const safe = fn => { try { fn(); } catch (e) {} };

  function loadClip(c) {
    if (apiFailed) return videoProblem("Couldn't load the YouTube player. Check your connection.");
    const my = ++token, id = videoId(c.url);
    withApi(() => {
      if (my !== token) return;
      if (!player) {
        player = new YT.Player("player", {
          videoId: id, width: "100%", height: "100%",
          playerVars: { autoplay: 1, start: Math.floor(c.start), controls: 0, rel: 0, modestbranding: 1, disablekb: 1, playsinline: 1, iv_load_policy: 3, fs: 0 },
          events: { onReady: e => e.target.playVideo(), onStateChange, onError: () => videoProblem("This video can't be embedded, or has been removed.") },
        });
      } else {
        player.loadVideoById({ videoId: id, startSeconds: c.start });
      }
    });
  }

  function onStateChange(e) {
    if (e.data === 1) $("tap").hidden = true; // PLAYING
    if (e.data === 0) { // ENDED
      if (stage === "intro") ask();
      else if (stage === "after") finish();
    }
  }

  // Polls the playhead so we can pause at the question point and stop at the end time.
  function poll() {
    if (stage === "intro" && cur && pt() >= cur.pauseAt - 0.05) ask();
    else if (stage === "after" && cur && cur.end !== null && pt() >= cur.end) finish();
  }

  // If the browser blocks autoplay, offer a tap to start.
  function armTap() {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (stage !== "intro" || !player || !player.getPlayerState) return;
      const s = player.getPlayerState();
      if (s !== 1 && s !== 3) $("tap").hidden = false;
    }, 3000);
  }
  $("tap").onclick = () => { $("tap").hidden = true; safe(() => player.playVideo()); };

  // ---------- flow ----------
  $("btn-start").onclick = startGame;
  $("btn-again").onclick = () => { $("screen-end").hidden = true; $("screen-start").hidden = false; refreshStart(); };
  $("btn-next").onclick = () => { idx++; beginRound(); };
  document.querySelectorAll('input[name="mode"]').forEach(r => r.onchange = refreshStart);

  function refreshStart() {
    const n = clipsFor(modeValue()).length;
    $("start-msg").textContent = n ? `${n} clip${n === 1 ? "" : "s"} available in this mode.` :
      (modeValue() === "easy" ? "No clips with wrong answers yet. Add some in the Clips tab." : "No clips yet. Add some in the Clips tab.");
  }

  function startGame() {
    unlockAudio();
    mode = modeValue();
    const pool = clipsFor(mode);
    if (!pool.length) return refreshStart();
    deck = shuffle(pool).slice(0, Number($("rounds").value)); idx = 0; score = 0;
    $("screen-start").hidden = true; $("screen-end").hidden = true; $("screen-game").hidden = false;
    clearInterval(tick); tick = setInterval(poll, 100);
    beginRound();
  }

  function beginRound() {
    if (idx >= deck.length) return endGame();
    cur = deck[idx]; stage = "intro"; result = null;
    $("st-round").textContent = `Clip ${idx + 1} of ${deck.length}`;
    $("st-score").textContent = `Score ${score}`;
    $("q-panel").hidden = true; $("endcard").hidden = true; $("tap").hidden = true;
    $("watch-msg").textContent = "Watch the clip. The question comes up when it pauses.";
    loadClip(cur); armTap();
  }

  function ask() {
    if (stage !== "intro") return;
    stage = "asking"; clearTimeout(tapTimer); $("tap").hidden = true;
    safe(() => player.pauseVideo());
    const qt = QT[cur.type];
    $("watch-msg").textContent = "";
    $("q-prompt").textContent = cur.prompt || qt.prompt;
    $("q-panel").hidden = false;
    $("q-options").hidden = mode !== "easy"; $("a-form").hidden = mode !== "hard";

    if (mode === "easy") {
      const box = $("q-options"); box.innerHTML = "";
      shuffle([cur.answer, ...cur.wrong]).forEach(opt => {
        const b = document.createElement("button"); b.textContent = opt;
        b.onclick = () => submit([opt]); box.appendChild(b);
      });
    } else {
      $("a-input").value = ""; $("a-input").placeholder = qt.hint || "Your answer";
      $("btn-mic").hidden = !SR;
      setTimeout(() => $("a-input").focus(), 0);
    }
    startTimer();
  }

  // ---------- countdown sound ----------
  let actx = null;
  const soundOn = () => $("sound").checked;
  function unlockAudio() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {}
  }
  function beep(freq, dur) {
    if (!actx || !soundOn()) return;
    try {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  // ---------- timer ----------
  function startTimer() {
    tStart = performance.now(); clearInterval(tInt); let lastSec = Infinity;
    const render = () => {
      const el = (performance.now() - tStart) / 1000, left = Math.max(0, CFG.timeLimit - el);
      $("t-num").textContent = Math.ceil(left) + "s";
      $("t-bar").style.width = (left / CFG.timeLimit * 100) + "%";
      $("t-bar").classList.toggle("low", left <= 5);
      $("t-bonus").style.visibility = el <= CFG.bonusWindow ? "visible" : "hidden";
      const sec = Math.ceil(left);
      if (sec < lastSec && sec >= 1 && sec <= 5) beep(sec === 1 ? 1100 : 700, sec === 1 ? 0.25 : 0.12);
      lastSec = Math.min(lastSec, sec);
      if (left <= 0) submit(null);
    };
    render(); tInt = setInterval(render, 100);
  }

  // candidates: array of strings (typed answer, or speech alternatives). null = timed out.
  function submit(candidates) {
    if (stage !== "asking") return;
    clearInterval(tInt); stopListening();
    const elapsed = (performance.now() - tStart) / 1000;
    const timedOut = candidates === null;
    const accepted = [cur.answer, ...cur.accept];
    let ok = false;
    if (!timedOut) {
      ok = mode === "easy" ? candidates[0] === cur.answer
        : candidates.some(g => QT[cur.type].check(g, accepted));
    }
    const fast = ok && elapsed <= CFG.bonusWindow;
    result = { ok, timedOut, fast, given: timedOut ? "" : candidates[0], points: ok ? (CFG.base + (fast ? CFG.bonus : 0)) * (mode === "hard" ? CFG.hardMultiplier : 1) : 0 };
    stage = "after";
    $("q-panel").hidden = true;
    $("watch-msg").textContent = "Answer locked in. Watch the rest of the clip.";
    if (cur.end !== null && cur.end <= cur.pauseAt) return finish();
    safe(() => player.playVideo());
  }

  function finish() {
    if (stage !== "after") return;
    stage = "done"; safe(() => player.pauseVideo());
    score += result.points;
    $("st-score").textContent = `Score ${score}`;
    $("watch-msg").textContent = "";
    const card = $("endcard");
    card.className = result.ok ? "ok" : "bad";
    $("end-title").textContent = result.ok ? "Correct!" : "Incorrect";
    $("end-answer").textContent = result.ok ? `"${cur.answer}"` : `Answer: ${cur.answer}` + (result.given ? `  (you said: ${result.given})` : "");
    $("end-points").textContent = result.ok ? `+${result.points}${result.fast ? " (includes speed bonus)" : ""}` : (result.timedOut ? "Time's up" : "+0");
    $("btn-next").textContent = idx + 1 >= deck.length ? "See result" : "Next";
    card.hidden = false;
  }

  function videoProblem(msg) {
    if (stage === "done" || stage === "idle") return;
    clearInterval(tInt); stopListening(); clearTimeout(tapTimer);
    stage = "done"; result = { ok: false, points: 0 };
    $("q-panel").hidden = true; $("tap").hidden = true; $("watch-msg").textContent = "";
    $("endcard").className = "bad";
    $("end-title").textContent = "Video unavailable";
    $("end-answer").textContent = msg; $("end-points").textContent = "This round does not count.";
    $("btn-next").textContent = idx + 1 >= deck.length ? "See result" : "Next";
    $("endcard").hidden = false;
  }

  function endGame() {
    stage = "idle"; clearInterval(tick); safe(() => player.pauseVideo());
    $("screen-game").hidden = true; $("screen-end").hidden = false;
    $("end-score").textContent = `Final score: ${score}`;
  }

  function abortGame() {
    stage = "idle"; token++; clearInterval(tick); clearInterval(tInt); clearTimeout(tapTimer); stopListening();
    safe(() => player.pauseVideo());
    $("screen-game").hidden = true; $("screen-end").hidden = true; $("screen-start").hidden = false;
  }

  // ---------- hard mode input: typing and speech ----------
  $("a-form").onsubmit = e => { e.preventDefault(); const v = $("a-input").value.trim(); if (v) submit([v]); };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function stopListening() { if (rec) { safe(() => rec.abort()); rec = null; } $("btn-mic").classList.remove("on"); $("btn-mic").textContent = "Speak"; }
  $("btn-mic").onclick = () => {
    if (rec) return stopListening();
    rec = new SR(); rec.lang = "en-GB"; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onresult = e => {
      const r = e.results[e.results.length - 1];
      $("a-input").value = r[0].transcript;
      if (r.isFinal) submit([...r].map(a => a.transcript));
    };
    rec.onerror = () => stopListening();
    rec.onend = () => { if (stage === "asking") stopListening(); };
    $("btn-mic").classList.add("on"); $("btn-mic").textContent = "Listening...";
    safe(() => rec.start());
  };

  // ---------- editor ----------
  const typeSel = $("f-type");
  Object.entries(QT).forEach(([k, v]) => typeSel.add(new Option(v.label, k)));
  let lastDefault = "";
  const applyDefaultPrompt = () => {
    const p = $("f-prompt");
    if (!p.value || p.value === lastDefault) { lastDefault = QT[typeSel.value].prompt; p.value = lastDefault; }
    else lastDefault = QT[typeSel.value].prompt;
  };
  typeSel.onchange = applyDefaultPrompt;
  typeSel.value = "next_line"; applyDefaultPrompt();

  const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);

  $("clip-form").onsubmit = e => {
    e.preventDefault();
    if (!videoId($("f-url").value)) return alert("Could not find a YouTube video ID in that URL.");
    const start = parseTime($("f-start").value), pauseAt = parseTime($("f-pause").value);
    const endRaw = $("f-end").value.trim(), end = endRaw ? parseTime(endRaw) : null;
    if (![start, pauseAt].every(Number.isFinite) || (end !== null && !Number.isFinite(end))) return alert("Times must be seconds or m:ss.");
    if (!(pauseAt > start)) return alert("The question point must be after the start.");
    if (end !== null && end < pauseAt) return alert("'Play until' must be at or after the question point.");
    const wrong = lines($("f-wrong").value).slice(0, 3);
    if (wrong.length === 1) return alert("Add 2 to 3 wrong answers for Easy mode, or leave the box empty for a Hard-only clip.");
    const clip = { url: $("f-url").value.trim(), start, pauseAt, type: typeSel.value, prompt: $("f-prompt").value.trim(),
      answer: $("f-answer").value.trim(), accept: lines($("f-accept").value), wrong };
    if (end !== null) clip.end = end;
    mine.push(clip); save();
    e.target.reset(); $("f-start").value = "0:00"; $("f-pause").value = "0:15"; typeSel.value = "next_line"; lastDefault = ""; $("f-prompt").value = ""; applyDefaultPrompt();
    renderList();
  };

  function renderList() {
    const all = [...seeds().map(c => ({ c, seed: true })), ...mine.map((c, i) => ({ c, i }))];
    $("clip-count").textContent = `(${all.length})`;
    const ul = $("clip-list"); ul.innerHTML = "";
    all.forEach(({ c, seed, i }) => {
      const n = normClip(c);
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = `${QT[n.type].label}: ${n.prompt || QT[n.type].prompt} [${fmt(n.start)} to ${fmt(n.pauseAt)}] = ${n.answer}` + (n.wrong.length >= 2 ? "" : " (Hard only)");
      li.appendChild(t);
      if (seed) { const s = document.createElement("span"); s.className = "tag"; s.textContent = "built-in"; li.appendChild(s); }
      else {
        const d = document.createElement("button"); d.textContent = "Delete";
        d.onclick = () => { if (confirm("Delete this clip?")) { mine.splice(i, 1); save(); renderList(); } };
        li.appendChild(d);
      }
      ul.appendChild(li);
    });
  }

  $("btn-export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 2)], { type: "application/json" }));
    a.download = "clips.json"; a.click();
  };
  $("f-import").onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data)) throw 0;
      mine = mine.concat(data.filter(c => c && videoId(c.url) && c.answer)); save(); renderList();
    } catch (err) { alert("Invalid clips file."); }
    e.target.value = "";
  };

  refreshStart();
})();
