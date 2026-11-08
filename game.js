(() => {
  const $ = id => document.getElementById(id);
  const KEY = "reelquiz.clips";
  let clips = [];
  try { clips = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
  if (!clips.length) clips = [...(window.SEED_CLIPS || [])];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(clips)); } catch (e) {} };

  // ---------- helpers ----------
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const parseTime = s => { s = String(s).trim(); if (s.includes(":")) { const p = s.split(":").map(Number); return p.reduce((a, b) => a * 60 + b, 0); } return Number(s); };
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const videoId = u => { const m = String(u).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };

  // ---------- tabs ----------
  const show = which => {
    $("view-play").hidden = which !== "play"; $("view-edit").hidden = which !== "edit";
    $("nav-play").classList.toggle("active", which === "play"); $("nav-edit").classList.toggle("active", which === "edit");
    if (which === "edit") renderList(); else { stopTimer(); }
  };
  $("nav-play").onclick = () => show("play");
  $("nav-edit").onclick = () => show("edit");

  // ---------- YouTube player ----------
  let player, apiReady = false, pending = null, timer = null, cur = null;
  const tag = document.createElement("script"); tag.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => { apiReady = true; if (pending) { pending(); pending = null; } };

  const stopTimer = () => { clearInterval(timer); timer = null; if (player && player.pauseVideo) try { player.pauseVideo(); } catch (e) {} };

  function playClip(c) {
    cur = c; $("cover").hidden = true;
    const go = () => {
      const opts = { videoId: videoId(c.url), playerVars: { start: Math.floor(c.start), controls: 0, rel: 0, modestbranding: 1, disablekb: 1, playsinline: 1 } };
      if (!player) {
        player = new YT.Player("player", { ...opts, width: "100%", height: "100%", playerVars: opts.playerVars, events: { onReady: e => e.target.playVideo(), onError: onPlayerError } });
      } else player.loadVideoById({ videoId: opts.videoId, startSeconds: c.start, endSeconds: c.end });
      clearInterval(timer);
      timer = setInterval(() => {
        if (player && player.getCurrentTime && player.getCurrentTime() >= c.end) { player.pauseVideo(); clearInterval(timer); $("cover").hidden = false; }
      }, 250);
    };
    apiReady ? go() : (pending = go);
  }
  function onPlayerError() { $("cover").hidden = false; $("cover").textContent = "Video unavailable or embedding disabled. Skip with Next after answering."; }
  $("btn-replay").onclick = () => { if (!cur) return; $("cover").textContent = "Clip finished"; playClip(cur); };

  // ---------- game ----------
  let deck = [], idx = 0, score = 0, locked = false;

  $("btn-start").onclick = start;
  $("btn-again").onclick = () => { $("screen-end").hidden = true; $("screen-start").hidden = false; };

  function start() {
    const usable = clips.filter(c => videoId(c.url));
    if (!usable.length) { $("start-msg").textContent = "No clips yet. Add some in the Clips tab."; return; }
    deck = shuffle(usable).slice(0, Number($("rounds").value)); idx = 0; score = 0;
    $("screen-start").hidden = true; $("screen-end").hidden = true; $("screen-game").hidden = false;
    next();
  }

  function next() {
    if (idx >= deck.length) {
      stopTimer(); $("screen-game").hidden = true; $("screen-end").hidden = false;
      $("end-score").textContent = `Final score: ${score} / ${deck.length}`; return;
    }
    const c = deck[idx]; locked = false;
    $("st-round").textContent = `Clip ${idx + 1} of ${deck.length}`; $("st-score").textContent = `Score ${score}`;
    $("q-prompt").textContent = `${c.type ? c.type + ": " : ""}${c.prompt}`;
    $("q-feedback").textContent = ""; $("btn-next").hidden = true;
    const box = $("q-options"); box.innerHTML = "";
    shuffle([c.answer, ...c.wrong]).forEach(opt => {
      const b = document.createElement("button"); b.textContent = opt;
      b.onclick = () => answer(b, opt, c); box.appendChild(b);
    });
    playClip(c);
  }

  function answer(btn, opt, c) {
    if (locked) return; locked = true;
    const ok = opt === c.answer; if (ok) score++;
    [...$("q-options").children].forEach(b => { if (b.textContent === c.answer) b.classList.add("correct"); });
    if (!ok) btn.classList.add("wrong");
    $("q-feedback").textContent = ok ? "Correct" : `Not quite. Answer: ${c.answer}`;
    $("st-score").textContent = `Score ${score}`;
    $("btn-next").hidden = false; $("btn-next").textContent = idx + 1 >= deck.length ? "See result" : "Next";
  }
  $("btn-next").onclick = () => { idx++; next(); };

  // ---------- editor ----------
  $("clip-form").onsubmit = e => {
    e.preventDefault();
    const id = videoId($("f-url").value);
    if (!id) return alert("Could not find a YouTube video ID in that URL.");
    const start = parseTime($("f-start").value), end = parseTime($("f-end").value);
    if (!(end > start)) return alert("End must be after start.");
    const wrong = $("f-wrong").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (wrong.length < 2) return alert("Add at least 2 wrong answers.");
    clips.push({ url: $("f-url").value.trim(), start, end, type: $("f-type").value, prompt: $("f-prompt").value.trim(), answer: $("f-answer").value.trim(), wrong: wrong.slice(0, 3) });
    save(); e.target.reset(); $("f-start").value = "0:00"; $("f-end").value = "0:15"; renderList();
  };

  function renderList() {
    $("clip-count").textContent = `(${clips.length})`;
    const ul = $("clip-list"); ul.innerHTML = "";
    clips.forEach((c, i) => {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.textContent = `${c.type}: ${c.prompt} [${fmt(c.start)}-${fmt(c.end)}] = ${c.answer}`;
      const d = document.createElement("button"); d.textContent = "Delete";
      d.onclick = () => { if (confirm("Delete this clip?")) { clips.splice(i, 1); save(); renderList(); } };
      li.append(t, d); ul.appendChild(li);
    });
  }

  $("btn-export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clips, null, 2)], { type: "application/json" }));
    a.download = "clips.json"; a.click();
  };
  $("f-import").onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data)) throw 0;
      clips = clips.concat(data.filter(c => c && videoId(c.url) && c.answer && Array.isArray(c.wrong)));
      save(); renderList();
    } catch (err) { alert("Invalid clips file."); }
    e.target.value = "";
  };
})();
