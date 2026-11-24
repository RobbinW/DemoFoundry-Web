import { comparison, MotionGroup } from './motion.js';

export function createPairReel(root, inspect, episodes) {
  const stage = root.querySelector('.reel-stage');
  const picker = root.querySelector('.reel-camera-picker');
  const transport = root.querySelector('.reel-player-controls');
  const cards = new Map();
  let index = 0, motion, drag, suppressClick = false;
  let player;
  const dots=root.querySelector('.reel-dots');

  function makeCard(scene) {
    const card = document.createElement('article');
    card.className = 'reel-card';
    card.setAttribute('aria-label', scene.title);
    const tile = document.createElement('div');
    tile.className = 'reel-view';
    card.append(tile);
    setPoster(tile, scene.cameras[0]);
    stage.append(card);
    return card;
  }

  function setPoster(tile, camera) {
    tile.style.setProperty('--ratio',camera.ratio);
    tile.style.setProperty('--poster','url("'+camera.poster+'")');
  }

  function releaseCamera() {
    motion?.destroy();
    player?.destroy();
    player?.surface.remove();
  }

  function mountCamera(card, scene, cameraIndex, time=0, cut=50, intent) {
    const camera=scene.cameras[cameraIndex], tile=card.firstElementChild;
    setPoster(tile,camera);
    player=comparison(camera,scene.title+' · '+camera.view);
    player.setCut(cut);
    const {surface,video}=player;
    const range=surface.querySelector('.wipe-range');
    const handle=surface.querySelector('.wipe-line');
    function changeCut(event) {
      const box=surface.getBoundingClientRect();
      player.setCut(Math.max(0,Math.min(100,(event.clientX-box.left)/box.width*100)));
    }
    handle.onpointerdown=event=>{
      if (!event.isPrimary || event.button!==0) return;
      event.preventDefault();
      range.focus({preventScroll:true});
      handle.setPointerCapture(event.pointerId);
      changeCut(event);
    };
    handle.onpointermove=event=>{
      if (handle.hasPointerCapture(event.pointerId)) changeCut(event);
    };
    tile.append(surface);
    motion=new MotionGroup(card,[video],'featured',{controls:transport,duration:scene.duration});
    if (intent!==undefined) motion.intent=intent;
    if (time>0) motion.seek(time);
    video.loop=episodes.length===1;
    video.onended=()=>{
      if (video===player.video && motion.playing && !video.loop) move(1);
    };
    [...picker.children].forEach((button,i)=>button.setAttribute('aria-pressed',i===cameraIndex));
  }

  function render() {
    releaseCamera();
    const current = episodes[index];
    const visible = new Set();
    picker.replaceChildren();
    for (const offset of [0, -1, 1, -2, 2]) {
      const scene = episodes[(index + offset + episodes.length) % episodes.length];
      if (!scene || visible.has(scene.id)) continue;
      visible.add(scene.id);
      if (!cards.has(scene.id)) cards.set(scene.id, makeCard(scene));
      const card = cards.get(scene.id);
      card.dataset.offset = offset;
      card.setAttribute('aria-hidden',offset!==0);
      if (offset!==0) continue;

      if (scene.cameras.length>1) scene.cameras.forEach((camera,i)=>{
        const button=document.createElement('button');
        button.type='button';
        button.textContent=camera.view;
        button.onclick=()=>{
          if (button.getAttribute('aria-pressed')==='true') return;
          const time=player.video.currentTime, intent=motion.intent;
          const cut=Number(player.surface.querySelector('.wipe-range').value);
          releaseCamera();
          mountCamera(card,scene,i,time,cut,intent);
        };
        picker.append(button);
      });
      mountCamera(card,scene,0);
    }
    for (const [key, card] of cards) {
      if (!visible.has(key)) { card.remove(); cards.delete(key); }
    }
    root.querySelector('.reel-caption h4').textContent = current.title;
    root.querySelector('.reel-caption p').textContent = current.dataset+' · '+current.cameras.length+(current.cameras.length===1?' view':' synchronized views');
    root.querySelector('.reel-position').textContent = (index+1)+' / '+episodes.length;
    dots.replaceChildren(...episodes.map((scene,i)=>{
      const dot=document.createElement('button');
      dot.type='button';
      dot.setAttribute('aria-label','Show '+scene.title);
      dot.setAttribute('aria-current',String(i===index));
      dot.onclick=()=>{index=i;render();dots.querySelector('[aria-current=true]').focus({preventScroll:true});};
      return dot;
    }));
    for (const control of root.querySelectorAll('[data-step]')) control.disabled = episodes.length<2;
  }
  function move(step) {
    index = (index + step + episodes.length) % episodes.length;
    render();
  }
  root.querySelector('.reel-inspect').addEventListener('click',()=>inspect(episodes[index],player.video.currentTime));
  for (const control of root.querySelectorAll('[data-step]')) {
    control.addEventListener('click',()=>move(Number(control.dataset.step)));
  }
  root.addEventListener('keydown',event=>{
    if (event.target.closest('input,select') || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
    event.preventDefault(); move(event.key==='ArrowLeft'?-1:1);
  });
  stage.addEventListener('click',event=>{
    if (suppressClick) return;
    const card = event.target.closest('.reel-card');
    if (!card) return;
    const step = Number(card.dataset.offset);
    if (step) move(step);

  });
  stage.addEventListener('pointerdown',event=>{
    if (!event.isPrimary || event.button!==0 || event.target.closest('.wipe-line')) return;
    suppressClick=false;
    drag={id:event.pointerId, x:event.clientX, y:event.clientY, horizontal:false};
  });
  stage.addEventListener('pointermove',event=>{
    if (!drag || event.pointerId!==drag.id) return;
    const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
    if (!drag.horizontal) {
      if (Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)) { drag=null; return; }
      if (Math.abs(dx)<8 || Math.abs(dx)<=Math.abs(dy)) return;
      drag.horizontal=true;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('dragging');
    }
    stage.style.setProperty('--drag',Math.max(-80,Math.min(80,dx*.5))+'px');
  });
  function finish(event) {
    if (!drag || event.pointerId!==drag.id) return;
    const dx=event.clientX-drag.x;
    suppressClick=drag.horizontal;
    const navigate=event.type==='pointerup' && drag.horizontal && Math.abs(dx)>32;
    drag=null;
    stage.classList.remove('dragging');
    stage.style.removeProperty('--drag');
    if (navigate) move(dx<0?1:-1);
  }
  stage.addEventListener('pointerup',finish);
  stage.addEventListener('pointercancel',finish);
  stage.addEventListener('pointerleave',()=>{if (!drag?.horizontal) drag=null;});

  // Treat a horizontal trackpad gesture, including its inertia, as a single turn.
  let scrollAmount=0, turned=false, resetScroll;
  stage.addEventListener('wheel',event=>{
    const dx=event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    if (!dx || (!event.shiftKey && Math.abs(dx)<=Math.abs(event.deltaY))) return;
    event.preventDefault();
    clearTimeout(resetScroll);
    scrollAmount+=dx*(event.deltaMode===1?16:1);
    if (!turned && Math.abs(scrollAmount)>=30) { move(Math.sign(scrollAmount)); turned=true; }
    resetScroll=setTimeout(()=>{turned=false;scrollAmount=0;},180);
  },{passive:false});
  render();
}
