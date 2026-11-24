export const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';

const names = {
  real: ['Real recording', 'Recording', 'recorded'],
  proxy: ['Simulation proxy', 'Proxy', 'proxy'],
  ours: ['DemoFoundry render', 'DemoFoundry', 'render'],
  baseline: ['Released MiniMax-H3', 'Released H3', 'compare']
};
const timeLabel = value => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const narrow = matchMedia('(max-width: 650px)');

export class SyncPlayer {
  constructor(root, { auto = false } = {}) {
    this.root = root;
    this.auto = auto && !reducedMotion.matches;
    this.visible = false;
    this.suspended = false;
    this.intent = this.auto;
    this.clips = [];
    this.version = 0;
    this.events = new AbortController();
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting && entry.intersectionRatio >= 0.2;
      this.refresh();
    }, { threshold: [0, 0.2] });
    this.observer.observe(root);
    document.addEventListener('visibilitychange', () => this.refresh(), { signal: this.events.signal });
    narrow.addEventListener('change', () => {
      const t = this.time;
      this.stop();
      this.seek(t);
      this.refresh();
    }, { signal: this.events.signal });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) { this.intent = false; this.stop(); }
    }, { signal: this.events.signal });
  }

  set(scene, roles, { time = 0, mobileRole, play = this.intent } = {}) {
    this.stop();
    this.version++;
    this.clips.forEach(video => { video.removeAttribute('src'); video.load(); });
    this.intent = play;
    this.roles = roles;
    this.mobileIndex = Math.max(0, roles.indexOf(mobileRole || 'ours'));
    const root = this.root;
    root.classList.toggle('switchable', roles.length >= 3);
    root.style.setProperty('--tracks', roles.length);
    root.style.setProperty('--aspect', scene.ratio || 640/352);
    const mobileSwitch = roles.length < 3 ? '' : '<div role="group" class="panel-switch" aria-label="Displayed video">' +
      roles.map((key, i) => '<button type="button" data-panel="' + i + '">' + names[key][1] + '</button>').join('') + '</div>';
    root.innerHTML = mobileSwitch + '<div class="screen-grid">' + roles.map(key => {
      const media = scene.media[key];
      return '<div class="screen" data-role="' + key + '"><div class="media-label">' + icon(names[key][2]) + names[key][0] +
        '</div><div class="media-frame"><video muted playsinline preload="none" poster="' + media.poster +
        '" aria-label="' + names[key][0] + '"></video></div></div>';
    }).join('') + '</div><div class="transport"><button type="button" class="play" aria-label="Play synchronized videos">' +
      icon('play') + '</button><input type="range" aria-label="Video time" min="0" step="0.01" value="0" max="' + scene.duration +
      '"><output class="timecode"></output></div><p role="status" class="screen-note" hidden></p>';
    this.clips = [...root.querySelectorAll('video')];
    this.input = root.querySelector('input');
    this.output = root.querySelector('output');
    this.toggle = root.querySelector('.play');
    this.note = root.querySelector('.screen-note');
    this.duration = scene.duration;
    this.bookmark = time;
    this.clips.forEach((video, i) => {
      video.muted = true;
      video.src = scene.media[roles[i]].src;
      video.addEventListener('error', () => {
        if (!video.isConnected) return;
        this.showError('This video could not be loaded. Reload the page to try again.');
        this.stop();
      });
      video.addEventListener('loadedmetadata', () => {
        if (video.isConnected && this.bookmark > 0 && !this.playing) video.currentTime = this.bookmark;
      });
      video.addEventListener('ended', () => {
        if (video !== this.leader || !this.playing) return;
        this.stop();
        this.seek(0);
        this.refresh();
      });
    });
    this.input.addEventListener('input', () => this.seek(+this.input.value, true));
    this.toggle.addEventListener('click', () => {
      this.intent = !this.playing;
      this.refresh();
    });
    this.root.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
      const t = this.time;
      this.stop();
      this.mobileIndex = Number(button.dataset.panel);
      this.markPanel();
      this.seek(t);
      this.refresh();
    }));
    this.markPanel();
    this.seek(time);
    this.refresh();
  }

  markPanel() {
    this.root.querySelectorAll('.screen').forEach((panel, i) => panel.classList.toggle('mobile-current', i === this.mobileIndex));
    this.root.querySelectorAll('[data-panel]').forEach((button, i) => button.setAttribute('aria-pressed', i === this.mobileIndex));
  }
  get activeClips() {
    return this.roles?.length >= 3 && narrow.matches ? [this.clips[this.mobileIndex]] : this.clips;
  }
  get leader() { return this.activeClips[0]; }
  get time() { return this.playing ? (this.leader?.currentTime || 0) : (this.bookmark || 0); }
  seek(t, loadFrame = false) {
    this.bookmark = Math.min(Math.max(0, t), this.duration || 0);
    this.activeClips.forEach(video => {
      if ((loadFrame || this.bookmark > 0) && !video.readyState && video.preload === 'none') video.preload = 'auto';
      if (loadFrame || this.bookmark || video.readyState) video.currentTime = this.bookmark;
    });
    this.display(this.bookmark);
  }
  display(t) {
    if (!this.input) return;
    this.input.value = t;
    this.input.style.setProperty('--progress', (100 * t / this.duration) + '%');
    this.output.textContent = timeLabel(t) + ' / ' + timeLabel(this.duration);
  }
  showError(message) {
    this.note.textContent = message;
    this.note.hidden = false;
    this.intent = false;
  }
  setButton(playing) {
    if (!this.toggle) return;
    this.toggle.innerHTML = icon(playing ? 'pause' : 'play');
    this.toggle.setAttribute('aria-label', playing ? 'Pause synchronized videos' : 'Play synchronized videos');
  }
  stop() {
    if (this.playing) this.bookmark = this.time;
    this.version++;
    cancelAnimationFrame(this.frame);
    this.playing = false;
    this.clips.forEach(video => video.pause());
    this.setButton(false);
  }
  refresh() {
    if (!this.intent || !this.visible || this.suspended || document.hidden) { this.stop(); return; }
    if (this.playing || !this.clips.length) return;
    const version = ++this.version;
    const active = this.activeClips;
    this.seek(this.bookmark || 0);
    this.playing = true;
    this.note.hidden = true;
    this.setButton(true);
    Promise.all(active.map(video => video.play())).then(() => {
      if (version !== this.version) return;
      const tick = () => {
        if (!this.playing || version !== this.version) return;
        const t = this.leader.currentTime;
        active.slice(1).forEach(video => {
          if (!video.seeking && !this.leader.seeking && Math.abs(video.currentTime - t) > .085) video.currentTime = t;
        });
        this.display(t);
        this.frame = requestAnimationFrame(tick);
      };
      tick();
    }).catch(error => {
      if (version !== this.version) return;
      this.stop();
      this.intent = false;
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') this.showError('Playback is unavailable for this clip.');
    });
  }
  suspend(value) { this.suspended = value; this.refresh(); }
  destroy() {
    this.stop();
    this.observer.disconnect();
    this.events.abort();
    this.root.replaceChildren();
    this.clips.forEach(video => { video.removeAttribute('src'); video.load(); });
    this.clips = [];
  }
}
