import { MotionGroup, preferred, preview } from './motion.js';

export function drawPairWall(root, scenes, inspect) {
  const rows = [];
  const previews = [];
  const rowCount = Math.min(3, Math.ceil(scenes.length / 7));
  const listeners = new AbortController();
  const options = {signal:listeners.signal};
  let frame = 0, previous = 0;

  function makeSet(items, duplicate) {
    const set = document.createElement('div');
    set.className = 'pair-wall-set';
    if (duplicate) set.setAttribute('aria-hidden','true');
    for (const scene of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pair-wall-card';
      card.setAttribute('aria-label','Inspect '+scene.title+' · '+scene.dataset);
      if (duplicate) card.tabIndex = -1;
      const path = 'media/pair-thumbs/'+scene.id;
      const video = preview({src:path+'.mp4',poster:path+'.jpg'},scene.title);
      const caption = document.createElement('span');
      caption.textContent = scene.title;
      card.append(video,caption);
      card.addEventListener('click',()=>inspect(scene,video.currentTime));
      set.append(card);
      previews.push(new MotionGroup(card,[video],'atlas'));
    }
    return set;
  }

  const layout = new ResizeObserver(()=>{
    for (const row of rows) {
      row.period = row.set.getBoundingClientRect().width;
      row.loop = row.period > row.view.clientWidth + 1;
      row.copy.hidden = !row.loop;
      row.view.classList.toggle('fits',!row.loop);
      if (!row.initialized && row.period) {
        row.position = row.loop ? (row.direction < 0 ? row.period*.45 : row.period*.04) : 0;
        row.view.scrollLeft = row.position;
        row.initialized = true;
      }
    }
  });

  for (let i=0;i<rowCount;i++) {
    const items = scenes.filter((_,j)=>j%rowCount===i);
    const view = document.createElement('div');
    view.className = 'pair-wall-row';
    const set=makeSet(items,false),copy=makeSet(items,true);
    view.append(set,copy);
    root.append(view);
    const row={view,set,copy,direction:i%2 ? -1 : 1,position:0,period:0,hold:false,manualUntil:0};
    rows.push(row);
    layout.observe(view);
    layout.observe(set);
    view.addEventListener('pointerenter',e=>{row.hold=e.pointerType==='mouse';},options);
    view.addEventListener('pointerleave',()=>{row.hold=false;},options);
    view.addEventListener('pointerdown',()=>{row.hold=true;},options);
    const release=()=>{row.hold=view.matches(':hover') && matchMedia('(hover:hover)').matches;row.manualUntil=performance.now()+1100;};
    view.addEventListener('pointerup',release,options);
    view.addEventListener('pointercancel',release,options);
    view.addEventListener('wheel',()=>{row.manualUntil=performance.now()+1000;},options);
  }

  function tick(now) {
    const dt = previous ? Math.min(50,now-previous) : 0;
    previous=now;
    if (preferred('atlas') && !document.hidden && !document.querySelector('dialog[open]')) {
      for (const row of rows) {
        if (!row.loop || row.hold || now<row.manualUntil || row.view.matches(':focus-within')) continue;
        const actual=row.view.scrollLeft;
        if (Math.abs(actual-row.position)>1) row.position=actual;
        row.position=(row.position+row.direction*dt*.024+row.period)%row.period;
        row.view.scrollLeft=row.position;
      }
    }
    frame=requestAnimationFrame(tick);
  }
  const visible=new IntersectionObserver(([entry])=>{
    cancelAnimationFrame(frame);
    previous=0;
    if(entry.isIntersecting) frame=requestAnimationFrame(tick);
  });
  visible.observe(root);
  return ()=>{
    visible.disconnect();
    layout.disconnect();
    cancelAnimationFrame(frame);
    listeners.abort();
    previews.forEach(group=>group.destroy());
    root.replaceChildren();
  };
}
