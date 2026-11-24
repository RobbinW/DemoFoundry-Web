import { icon } from './player.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const groups = new Set();
const saved = new Map();
let modalOpen = false;
const visible = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const group = entry.target._motion;
    if (!group) continue;
    group.visible = entry.isIntersecting;
    group.update();
  }
}, {threshold:0.01});

const retention = new IntersectionObserver(entries => {
  for(const entry of entries){
    const group=entry.target._motion;
    if(!group)continue;
    clearTimeout(group.releaseTimer);
    if(!entry.isIntersecting)group.releaseTimer=setTimeout(()=>group.release(),400);
  }
},{rootMargin:'700px'});
export function preferred(scope) { return saved.get(scope) ?? !reduced.matches; }
function labelButton(b, on, suffix) {
  b.innerHTML = icon(on ? 'pause':'play') + '<span>' + (on ? 'Pause':'Play') + suffix + '</span>';
}
function updateButtons() {
  document.querySelectorAll('[data-motion]').forEach(b => labelButton(b, preferred(b.dataset.motion),' previews'));
}
export function initMotion() {
  for (const b of document.querySelectorAll('[data-motion]')) b.addEventListener('click', () => {
    const scope=b.dataset.motion, wanted=!preferred(scope);
    saved.set(scope,wanted);
    for(const g of groups) if(g.scope===scope) {g.intent=wanted;g.update();}
    updateButtons();
  });
  updateButtons();
}
reduced.addEventListener('change',()=>{
  for(const g of groups) {g.intent=preferred(g.scope);g.update();}
  updateButtons();
});
document.addEventListener('visibilitychange',()=>groups.forEach(g=>g.update()));
export function showModal(on) {modalOpen=on;groups.forEach(g=>g.update());}

function videoFor(asset) {
  const v=document.createElement('video');
  v.playsInline=true; v.muted=true; v.loop=true; v.preload='none';
  v.dataset.src=asset.src;
  if(asset.poster) v.poster=asset.poster;
  return v;
}
export function preview(asset, label) {
  const v=videoFor(asset);v.setAttribute('aria-label',label);return v;
}
const clock = t => Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
export class MotionGroup {
  constructor(root, videos, scope, {controls,duration}={}) {
    this.root=root;this.videos=videos;this.scope=scope;this.intent=preferred(scope);this.visible=false;
    this.duration=duration||0;this.run=0;this.playing=false;this.pendingTime=0;this.cleanup=new AbortController();
    root._motion=this;
    if(controls) this.addControls(controls);
    const signal=this.cleanup.signal;
    videos.forEach(v=>{
      v.addEventListener('loadedmetadata',()=>{if(this.pendingTime>0)v.currentTime=this.pendingTime;},{signal});
      v.addEventListener('error',()=>{
        if(!v.hasAttribute('src'))return;
        this.intent=false;this.update();
        let msg=this.root.querySelector('.load-error');
        if(!msg){msg=document.createElement('p');msg.className='load-error';msg.setAttribute('role','status');msg.textContent='Video could not be loaded.';this.root.append(msg);}
      },{signal});
    });
    videos[0].addEventListener('timeupdate',()=>{
      const t=videos[0].currentTime;
      if(this.playing) for(const v of videos.slice(1)) if(v.readyState>=2&&!v.seeking&&Math.abs(v.currentTime-t)>.08)v.currentTime=t;
      if(this.input){this.input.value=t;this.output.textContent=clock(t)+' / '+clock(this.duration);}
    },{signal});
    groups.add(this);visible.observe(root);retention.observe(root);
  }
  addControls(root) {
    root.className='play-controls';
    root.innerHTML='<button type="button" aria-label="Play synchronized views">'+icon('play')+'</button><input type="range" min="0" step="0.01" value="0" aria-label="Synchronized video time"><output></output>';
    this.input=root.querySelector('input');this.input.max=this.duration;
    this.output=root.querySelector('output');this.output.textContent='0:00 / '+clock(this.duration);
    this.playButton=root.querySelector('button');
    this.playButton.onclick=()=>{this.intent=!this.playing;this.update();};
    this.input.oninput=()=>this.seek(+this.input.value);
  }
  load() {
    for(const v of this.videos) if(!v.hasAttribute('src')){v.preload='auto';v.src=v.dataset.src;}
  }
  seek(t) {
    this.load();this.pendingTime=t;
    for(const v of this.videos)v.currentTime=t;
    if(this.input){this.input.value=t;this.output.textContent=clock(t)+' / '+clock(this.duration);}
  }
  update() {
    const play=this.intent&&this.visible&&!document.hidden&&(this.scope==='detail' ? modalOpen : !modalOpen);
    if(play===this.playing)return;
    this.playing=play;const version=++this.run;
    if(this.playButton){this.playButton.innerHTML=icon(play?'pause':'play');this.playButton.setAttribute('aria-label',play?'Pause synchronized views':'Play synchronized views');}
    if(!play){this.videos.forEach(v=>v.pause());return;}
    this.load();
    Promise.all(this.videos.map(v=>v.play())).catch(()=>{
      if(this.run!==version)return;
      this.intent=false;this.update();
    });
  }
  release() {
    if(this.visible||this.playing||!this.videos[0].hasAttribute('src'))return;
    this.pendingTime=this.videos[0].currentTime;
    for(const v of this.videos){v.removeAttribute('src');v.load();}
  }
  destroy() {
    clearTimeout(this.releaseTimer);retention.unobserve(this.root);
    this.intent=false;this.update();visible.unobserve(this.root);groups.delete(this);delete this.root._motion;this.cleanup.abort();
    for(const v of this.videos){v.pause();v.removeAttribute('src');v.load();}
  }
}

// Each decoded source frame contains the two synchronized camera images side by side.
// Both visible regions read from that frame, so moving the divider cannot change its time.
export function comparison(camera, name, onCut) {
  const surface=document.createElement('div');surface.className='wipe';surface.style.setProperty('--ratio',camera.ratio);
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
  const video=videoFor({src:camera.src});video.className='source';video.setAttribute('aria-hidden','true');
  surface.append(video,canvas);
  surface.insertAdjacentHTML('beforeend','<span class="role r">Real</span><span class="role s">Proxy</span><span class="wipe-line"><span class="grip"><svg viewBox="0 0 20 20"><path d="m7 6-4 4 4 4m6-8 4 4-4 4"/></svg></span></span><input class="wipe-range" type="range" min="0" max="100" step="0.25" value="50">');
  const range=surface.querySelector('input');range.setAttribute('aria-label',name+' · real recording visible');
  const ctx=canvas.getContext('2d',{alpha:false});
  const poster=new Image();let fraction=.5,frameId=0,dead=false;
  function paint() {
    if(dead)return;
    const useVideo=video.readyState>=2;
    if(!useVideo && !poster.naturalWidth)return;
    const source=useVideo?video:poster;
    const width=(useVideo?video.videoWidth:poster.naturalWidth)/2,height=useVideo?video.videoHeight:poster.naturalHeight;
    const output=Math.min(width,Math.ceil(surface.clientWidth*(window.devicePixelRatio||1)));
    if(!output||!height)return;
    const h=Math.round(output*height/width);
    if(canvas.width!==output||canvas.height!==h){canvas.width=output;canvas.height=h;}
    const cut=Math.round(output*fraction), sourceCut=width*cut/output;
    if(cut)ctx.drawImage(source,0,0,sourceCut,height,0,0,cut,h);
    if(cut<output)ctx.drawImage(source,width+sourceCut,0,width-sourceCut,height,cut,0,output-cut,h);
  }
  function drawVideo() {
    if(dead)return;
    paint();
    frameId=video.requestVideoFrameCallback(drawVideo);
  }
  if(video.requestVideoFrameCallback) frameId=video.requestVideoFrameCallback(drawVideo);
  else video.addEventListener('timeupdate',paint);
  video.addEventListener('loadeddata',paint);video.addEventListener('seeked',paint);
  const resize=new ResizeObserver(paint);resize.observe(surface);
  const loadPoster=new IntersectionObserver(([entry])=>{
    if(entry.isIntersecting){poster.onload=paint;poster.src=camera.poster;loadPoster.disconnect();}
  },{rootMargin:'400px'});loadPoster.observe(surface);
  function setCut(percent) {
    fraction=percent/100;range.value=percent;range.setAttribute('aria-valuetext',Math.round(percent)+' percent real');
    surface.style.setProperty('--cut',percent+'%');paint();
  }
  range.addEventListener('input',()=>{setCut(+range.value);onCut?.(+range.value);});
  setCut(50);
  return {surface,video,setCut,destroy:()=>{dead=true;loadPoster.disconnect();resize.disconnect();poster.onload=null;if(frameId)video.cancelVideoFrameCallback(frameId);}};
}
