import { drawPairWall } from './pair-wall.js';
import { createPairReel } from './pair-reel.js';
import { coverSources } from './covers.js';
import { atlas } from './atlas.js';
import { gallery } from './examples.js';
import { icon } from './player.js';
import { mountStackFeature } from './stack-feature.js';
import { comparison, MotionGroup, preview, initMotion, showModal } from './motion.js';

const id = key => document.getElementById(key);
const node = (tag, className, text) => {
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
};
const button = (className,label,action) => {
  const b=node('button',className,label);b.type='button';b.addEventListener('click',action);return b;
};
const narrow=matchMedia('(max-width:650px)'), tablet=matchMedia('(max-width:960px)');
const dialog=id('viewer'),body=id('viewer-body');
let cleanDetail=()=>{};

// Set each column in proportion to the native image aspect ratio so all media
// in a row share the same height without cropping a gripper or a target object.
const rowLayouts=[];
function wall(root,items,count,className='strip-row') {
  function layout() {
    const cols=count();
    if(root.dataset.cols===String(cols))return;
    root.dataset.cols=cols;
    const fragment=document.createDocumentFragment();
    for(let off=0;off<items.length;off+=cols) {
      const row=node('div',className), chunk=items.slice(off,off+cols);
      const widths=chunk.map(x=>x.ratio+'fr');
      while(widths.length<cols)widths.push('1.55fr');
      row.style.setProperty('--columns',widths.join(' '));
      row.append(...chunk.map(x=>x.el));fragment.append(row);
    }
    root.replaceChildren(fragment);
  }
  delete root.dataset.cols;layout();rowLayouts.push(layout);
  return ()=>{const index=rowLayouts.indexOf(layout);if(index>=0)rowLayouts.splice(index,1);};
}
[narrow,tablet].forEach(query=>query.addEventListener('change',()=>rowLayouts.forEach(layout=>layout())));
function openDialog(kicker,title) {
  id('viewer-kicker').textContent=kicker;id('viewer-title').textContent=title;
  showModal(true);dialog.showModal();
}
dialog.querySelector('.dismiss').onclick=()=>dialog.close();
dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
});
dialog.addEventListener('close',()=>{
  cleanDetail();cleanDetail=()=>{};
  body.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
  body.replaceChildren();showModal(false);
});
function showFilm(){
  const movie=node('video','film');movie.controls=true;movie.playsInline=true;movie.preload='metadata';
  movie.src='media/overview/project-film.mp4?v=024c28a07d1f';movie.setAttribute('aria-label','DemoFoundry project video');
  body.append(movie);openDialog('DemoFoundry','Project video');movie.play().catch(()=>{});
}
id('watch-film').onclick=showFilm;
function showRender(scene,at=0){
  const movie=node('video','enlarged-render');
  movie.controls=true;movie.playsInline=true;movie.muted=true;movie.loop=true;movie.poster=scene.media.ours.poster;
  movie.src=scene.media.ours.src;movie.setAttribute('aria-label',scene.title+' · DemoFoundry render');
  movie.currentTime=at;
  const desc=node('p','detail-copy',scene.description);
  const more=node('details','viewer-extra'),summary=node('summary','','View the appearance reference');
  const img=node('img');img.loading='lazy';img.src=scene.appearance_reference;img.alt='First recorded RGB frame used as the appearance reference';
  more.append(summary,img);body.append(movie,desc,more);
  const split={train:' · Training episode',val:' · Validation episode'}[scene.split]||'';
  openDialog(scene.dataset+' · '+scene.view+split,scene.title);movie.play().catch(()=>{});
}
function renderTile(scene) {
  const video=preview(scene.media.ours,scene.title);
  const play=button('render-btn','',()=>showRender(scene,video.currentTime));
  play.style.aspectRatio=scene.ratio;play.setAttribute('aria-label','View render · '+scene.title);play.append(video);
  new MotionGroup(play,[video],'generation');
  const card=node('article','render-card'),caption=node('div','caption');
  caption.append(button('',scene.title,()=>showRender(scene,video.currentTime)),node('span','meta',scene.dataset));
  card.append(play,caption);return {el:card,ratio:scene.ratio};
}

const portrait=matchMedia('(max-aspect-ratio:1/1)');
let coverMotion;
function mountCover(){
  const stage=id('cover-grid'), layout=portrait.matches?'portrait':document.documentElement.dataset.cover;
  coverMotion?.destroy();
  const path=coverSources[layout];
  const video=preview({src:path+'.mp4',poster:path+'.jpg'},'Generated robot demonstrations');
  video.setAttribute('aria-hidden','true');
  video.disablePictureInPicture=true;
  stage.replaceChildren(video);
  coverMotion=new MotionGroup(stage,[video],'hero');
}
mountCover();portrait.addEventListener('change',mountCover);
const renders=gallery.map(renderTile);
const renderLimit=8;
let renderLayout;
function drawRenders(expanded){
  renderLayout?.();
  renderLayout=wall(id('render-grid'),expanded?renders:renders.slice(0,renderLimit),()=>narrow.matches?2:tablet.matches?3:4);
  const toggle=id('gallery-toggle');
  toggle.textContent=expanded?'Show fewer renders':'See all '+renders.length+' renders';
  toggle.setAttribute('aria-expanded',expanded);
}
id('gallery-toggle').onclick=()=>drawRenders(id('gallery-toggle').getAttribute('aria-expanded')!=='true');
drawRenders(false);

for(const film of document.querySelectorAll('.story-motion')){
  const movie=preview({src:film.dataset.src,poster:film.dataset.poster},film.getAttribute('aria-label'));
  film.append(movie);
  new MotionGroup(film,[movie],'story');
}

for(const reader of document.querySelectorAll('.plate-reader')){
  const picks=[...reader.querySelectorAll('.plate-pick')];
  for(const pick of picks)pick.addEventListener('click',()=>{
    for(const item of picks){
      const active=item===pick;
      item.setAttribute('aria-pressed',active);
      id(item.getAttribute('aria-controls')).hidden=!active;
    }
  });
}

function cameraSet(root,scene,scope,time=0) {
  const deck=node('div','multi-deck'),bar=node('div');
  deck.dataset.count=scene.cameras.length;deck.style.setProperty('--n',scene.cameras.length);
  deck.style.setProperty('--single-ratio',scene.cameras[0].ratio);
  const players=[];
  for(const camera of scene.cameras) {
    const item=node('figure','camera-tile');
    const player=comparison(camera,scene.title+' · '+camera.view,value=>players.forEach(c=>c.setCut(value)));
    players.push(player);item.append(player.surface,node('figcaption','',camera.view));deck.append(item);
  }
  root.replaceChildren(deck,bar);
  const group=new MotionGroup(root,players.map(c=>c.video),scope,{controls:bar,duration:scene.duration});
  if(time>0)group.seek(Math.min(scene.duration-.05,time));
  return ()=>{players.forEach(c=>c.destroy());group.destroy();};
}
function inspectPair(scene,time=0) {
  const wrapper=node('div','expanded-pair');
  body.append(wrapper,node('p','detail-copy','The two sides show the same camera at the same timestamp. Drag the divider, or use the arrow keys when it is focused.'));
  openDialog(scene.dataset+' · '+scene.cameras.length+(scene.cameras.length===1?' camera':' cameras'),scene.title);
  cleanDetail=cameraSet(wrapper,scene,'detail',time);
}
const multi=atlas.filter(s=>s.cameras.length>=2);
const featuredPairIds=['agibot-mallet','droid-019-guptalab','agibot-slot','droid-018-guptalab','rh20t-0003','droid-004-autolab'];
multi.sort((a,b)=>(featuredPairIds.includes(a.id)?featuredPairIds.indexOf(a.id):100)-(featuredPairIds.includes(b.id)?featuredPairIds.indexOf(b.id):100));
const chooser=id('multi-select');let cleanFeatured=()=>{};
if (chooser) {
  for(const scene of multi) {
    const option=node('option','',scene.dataset+' · '+scene.title);
    option.value=scene.id;
    chooser.append(option);
  }
  const featured = id('multi-group');
  chooser.value = featured.dataset.first || multi[0].id;
  chooser.onchange = () => {
    cleanFeatured();
    const scene=multi.find(s=>s.id===chooser.value);
    if(scene) cleanFeatured=cameraSet(featured,scene,'featured');
  };
  chooser.onchange();
}

let filter='All', page=0, atlasGroups=[];
const reel=id('pair-reel');
if (reel) {
  const scenes=featuredPairIds.map(key=>atlas.find(scene=>scene.id===key));
  // Lead with the wrist view where both fingertips and the tray slot are visible.
  const featured=scenes.map(scene=>scene.id==='agibot-slot'
    ? {...scene,cameras:[...scene.cameras].sort((a,b)=>Number(b.view==='Right wrist')-Number(a.view==='Right wrist'))}
    : scene);
  createPairReel(reel,inspectPair,featured);
}
// Lead the gallery with other episodes while keeping every pair browsable.
const galleryPairs=reel ? [...atlas.filter(scene=>!featuredPairIds.includes(scene.id)),
  ...atlas.filter(scene=>featuredPairIds.includes(scene.id))] : atlas;
const pairWall=id('pair-wall');
let layoutMode=pairWall?'wall':'grid', cleanWall;
for (const control of document.querySelectorAll('.wall-switch button')) {
  control.onclick=()=>{
    layoutMode=control.dataset.layout;
    for (const item of control.parentElement.children) item.setAttribute('aria-pressed',item===control);
    drawAtlas();
  };
}
const episodesPerPage=8;
const labels=['All','DROID','AgiBot World','RoboMIND','RH20T','Multi-view'];
const filterWrap=id('dataset-filters');
for(const label of labels) {
  const b=button('',label,()=>{
    if(filter===label)return;
    filter=label;page=0;drawAtlas();
  });
  b.dataset.value=label;filterWrap.append(b);
}
function drawAtlas(){
  atlasGroups.forEach(group=>group.destroy());atlasGroups=[];
  const selected=galleryPairs.filter(s=>filter==='All'||s.dataset===filter||(filter==='Multi-view'&&s.cameras.length>1));
  filterWrap.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',filter===b.dataset.value));
  if (pairWall) {
    cleanWall?.();
    cleanWall=null;
    const wallMode=layoutMode==='wall';
    pairWall.hidden=!wallMode;
    id('atlas-grid').hidden=wallMode;
    id('next-page').parentElement.hidden=wallMode;
    if (wallMode) {
      id('atlas-grid').replaceChildren();
      id('pair-count').textContent=selected.length+' episodes';
      cleanWall=drawPairWall(pairWall,selected,inspectPair);
      return;
    }
  }
  const start=page*episodesPerPage, end=Math.min(start+episodesPerPage,selected.length);
  id('pair-count').textContent=(start+1)+'–'+end+' of '+selected.length+' episodes';
  id('page-number').textContent='Page '+(page+1)+' of '+Math.ceil(selected.length/episodesPerPage);
  id('prev-page').disabled=page===0;
  id('next-page').disabled=end===selected.length;
  const cards=selected.slice(start,end).map(scene=>{
    const camera=scene.cameras[0],card=node('article','atlas-card');
    const video=preview(camera,scene.title+' · '+camera.view+' · real recording and simulation proxy');
    const open=button('pair-preview','',()=>inspectPair(scene,video.currentTime));
    open.setAttribute('aria-label','Inspect '+scene.title+' · '+scene.dataset);
    const legend=node('span','pair-legend');
    legend.append(node('span','','Real recording'),node('span','','Simulation proxy'));
    const frame=node('span','pair-frame');frame.append(video);
    open.append(legend,frame);
    const caption=node('div','pair-caption');
    caption.append(node('h4','',scene.title),node('span','pair-meta',scene.dataset+' · '+scene.cameras.length+(scene.cameras.length===1?' view':' views')));
    card.append(open,caption);
    atlasGroups.push(new MotionGroup(frame,[video],'atlas'));
    return card;
  });
  id('atlas-grid').replaceChildren(...cards);
}
function turnPage(step){
  page+=step;drawAtlas();
  id('recordings-title').focus({preventScroll:true});
  (id('paired-recordings') || id('recordings')).scrollIntoView({block:'start'});
}
id('prev-page').onclick=()=>turnPage(-1);
id('next-page').onclick=()=>turnPage(1);
drawAtlas();
mountStackFeature(id('novel-feature'));
for (const row of document.querySelectorAll('.domain-clips')) {
  const videos = [...row.querySelectorAll('video')];
  for (const video of videos) video.muted = true;
  new MotionGroup(row, videos, 'domain');
}
initMotion();
const nav=[...document.querySelectorAll('nav a')];
function markSection(){
  const current=[...document.querySelectorAll('main>section')].findLast(s=>s.getBoundingClientRect().top<innerHeight*.3);
  document.querySelector('header').classList.toggle('over-cover',id('overview').getBoundingClientRect().bottom>document.querySelector('header').offsetHeight+24);
  nav.forEach(a=>{if(current&&a.hash==='#'+current.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
}
addEventListener('resize',markSection);
let frame=0;addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{markSection();frame=0;});},{passive:true});markSection();
