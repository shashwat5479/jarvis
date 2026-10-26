/* bridge.js - browser replacement for the Python/Eel backend.
   Speech in/out use the Web Speech API, data lives in localStorage,
   and AI answers come from the /api/chat serverless function. */
(function () {
  const exposed = {};
  const ui = (name, ...a) => { try { return exposed[name] && exposed[name](...a); } catch (e) { console.error(e); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  let seq = Date.now();

  // ---- data (same row shapes the UI already expects) ----
  const sysCmds = () => load('jv_sys', []);                  // [id, name, deep link]
  const webCmds = () => load('jv_web', [
    [1, 'youtube', 'https://www.youtube.com'], [2, 'google', 'https://www.google.com'],
    [3, 'github', 'https://github.com'], [4, 'gmail', 'https://mail.google.com'],
    [5, 'maps', 'https://maps.google.com'], [6, 'spotify', 'https://open.spotify.com'],
    [7, 'whatsapp', 'https://web.whatsapp.com']]);
  const contacts = () => load('jv_contacts', []);           // [id, name, mobile, email, city]

  // ---- speech out ----
  const synth = window.speechSynthesis;
  function speak(text) {
    text = String(text);
    ui('DisplayMessage', text);
    ui('receiverText', text);
    return new Promise((done) => {
      if (!synth) return done();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(0, 600));
      u.onend = u.onerror = () => done();
      synth.speak(u);
      setTimeout(done, 20000); // never hang if the browser drops the event
    });
  }

  // ---- speech in ----
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { speak('Voice input is not supported in this browser. Please type your command.'); return Promise.resolve(''); }
    return new Promise((done) => {
      const r = new SR();
      let heard = '', err = '';
      r.lang = 'en-IN'; r.interimResults = true;
      ui('DisplayMessage', 'listening....');
      r.onresult = (e) => { heard = Array.from(e.results).map((x) => x[0].transcript).join(' '); ui('DisplayMessage', heard); };
      r.onerror = (e) => { err = e.error; };
      r.onend = () => {
        if (err === 'not-allowed' || err === 'service-not-allowed') speak('Microphone access is blocked. Allow it in your browser settings.');
        done(heard.toLowerCase());
      };
      try { r.start(); } catch (e) { done(''); }
    });
  }

  // ---- helpers ----
  function addLink(url, label) {
    const box = document.getElementById('chat-canvas-body');
    if (!box) return;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label;
    a.className = 'receiver_message d-inline-block mb-3 text-info';
    box.appendChild(a);
  }
  function openUrl(url, label) {
    const w = window.open(url, '_blank');
    if (w) { w.opener = null; return true; }
    addLink(url, 'Tap to open ' + label); // popup blocked (common after voice input)
    return false;
  }
  const plain = (t) => String(t).replace(/```[\s\S]*?```/g, ' ').replace(/[*#_`>~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

  function findContact(q) {
    const drop = ['jarvis', 'make', 'a', 'to', 'phone', 'call', 'send', 'message', 'whatsapp', 'video'];
    const name = q.split(/\s+/).filter((w) => !drop.includes(w)).join(' ').trim();
    const hit = name && contacts().find((c) => String(c[1]).toLowerCase().includes(name));
    if (!hit) return null;
    let no = String(hit[2]).replace(/[^\d+]/g, '');
    if (!no.startsWith('+')) no = '+91' + no; // same default as the desktop version
    return { no, name };
  }

  async function askAI(query) {
    const send = () => fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('jv_code') || '' },
      body: JSON.stringify({ query }),
    });
    let r = await send();
    if (r.status === 401) {
      const code = window.prompt('Enter access code');
      if (!code) return 'Access code required.';
      localStorage.setItem('jv_code', code);
      r = await send();
      if (r.status === 401) { localStorage.removeItem('jv_code'); return 'Wrong access code.'; }
    }
    const d = await r.json().catch(() => ({}));
    return r.ok ? plain(d.text) : (d.error || 'The assistant is unavailable right now.');
  }

  // ---- command router (port of engine/command.py) ----
  async function route(q) {
    q = q.replace(/\bjarvis\b/g, '').trim();
    if (/^(please )?open\s+\S/.test(q)) {
      const app = q.replace(/.*\bopen\b/, '').trim();
      const row = sysCmds().find((c) => c[1] === app) || webCmds().find((c) => c[1] === app);
      if (row) { openUrl(row[2], app); return speak('Opening ' + app); }
      if (/^[\w-]+(\.[\w-]+)+$/.test(app)) { openUrl('https://' + app, app); return speak('Opening ' + app); }
      return speak("I don't know " + app + '. Add it under Settings, Commands.');
    }
    const yt = q.match(/play\s+(.*?)\s+on\s+youtube/);
    if (yt) { openUrl('https://www.youtube.com/results?search_query=' + encodeURIComponent(yt[1]), 'YouTube'); return speak('Playing ' + yt[1] + ' on YouTube'); }
    if (/send message|phone call|video call/.test(q)) {
      const c = findContact(q);
      if (!c) return speak('Not found in contacts');
      await speak('Which mode do you want to use, WhatsApp or mobile?');
      const mode = await listen();
      const isMsg = q.includes('send message');
      let text = '';
      if (isMsg) { await speak('What message to send?'); text = await listen(); }
      if (mode.includes('mobile')) {
        openUrl(isMsg ? 'sms:' + c.no + '?body=' + encodeURIComponent(text) : 'tel:' + c.no, c.name);
        return speak(isMsg ? 'Message ready for ' + c.name : 'Calling ' + c.name);
      }
      if (mode.includes('whatsapp')) {
        openUrl('https://wa.me/' + c.no.replace('+', '') + (text ? '?text=' + encodeURIComponent(text) : ''), 'WhatsApp');
        return speak('Opening WhatsApp for ' + c.name);
      }
      return speak('Please try again');
    }
    return speak(await askAI(q.replace(/\bsearch\b/, '').trim()));
  }

  // ---- what the old Python side exposed ----
  const backend = {
    async init() {
      await sleep(0);
      ui('DisplayMessage', 'Tap anywhere to start');
      await new Promise((go) => addEventListener('pointerdown', go, { once: true }));
      backend.playAssistantSound();
      ui('hideLoader');
      await sleep(1200);
      ui('hideFaceAuth');
      await speak('Access granted');
      ui('hideFaceAuthSuccess');
      await speak('Hello, Welcome Sir, How can I help you');
      ui('hideStart');
    },
    playAssistantSound() { try { new Audio('assets/audio/start_sound.mp3').play().catch(() => {}); } catch (e) { /* ignore */ } },
    async allCommands(message) {
      const typed = message !== undefined && message !== 1;
      const q = typed ? String(message) : await listen();
      if (q) ui('senderText', q);
      try { await (q ? route(q.toLowerCase()) : speak("Sorry, I didn't catch that")); }
      catch (e) { console.error(e); await speak('Something went wrong'); }
      ui('ShowHood');
    },
    assistantName: () => 'jarvis',
    personalInfo() { const i = load('jv_info', null); if (i) ui('getData', JSON.stringify(i)); return 1; },
    updatePersonalInfo(...info) { save('jv_info', info); backend.personalInfo(); return 1; },
    displaySysCommand() { ui('displaySysCommand', JSON.stringify(sysCmds())); return 1; },
    addSysCommand(k, v) { save('jv_sys', [...sysCmds(), [++seq, k.toLowerCase().trim(), v.trim()]]); },
    deleteSysCommand(id) { save('jv_sys', sysCmds().filter((r) => String(r[0]) !== String(id))); },
    displayWebCommand() { ui('displayWebCommand', JSON.stringify(webCmds())); return 1; },
    addWebCommand(k, v) {
      v = v.trim(); if (!/^[a-z]+:/i.test(v)) v = 'https://' + v;
      save('jv_web', [...webCmds(), [++seq, k.toLowerCase().trim(), v]]);
    },
    deleteWebCommand(id) { save('jv_web', webCmds().filter((r) => String(r[0]) !== String(id))); },
    displayPhoneBookCommand() { ui('displayPhoneBookCommand', JSON.stringify(contacts())); return 1; },
    deletePhoneBookCommand(id) { save('jv_contacts', contacts().filter((r) => String(r[0]) !== String(id))); },
    InsertContacts(n, m, e, c) { save('jv_contacts', [...contacts(), [++seq, n, m, e || '', c || '']]); },
  };

  // eel-compatible shim: eel.fn(args) runs async and returns a function giving the result
  window.eel = new Proxy({}, {
    get(_, name) {
      if (name === 'expose') return (fn, alias) => { exposed[alias || fn.name] = fn; };
      return (...args) => {
        const p = sleep(0).then(() => backend[name] && backend[name](...args));
        p.catch(console.error);
        return () => p;
      };
    },
  });
})();
