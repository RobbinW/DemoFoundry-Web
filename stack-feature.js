import { MotionGroup, preview } from './motion.js';

export function mountStackFeature(root) {
  const route = root.querySelector('.stack-route');
  const choices = root.querySelectorAll('[data-view]');
  let motion;

  function select(button) {
    const view = button.dataset.view;
    const prefix = 'media/marvin-matched/' + view + '-';
    const time = motion?.videos[0].currentTime || 0;
    const intent = motion?.intent;
    motion?.destroy();

    for (const choice of choices) choice.setAttribute('aria-pressed', choice === button);
    for (const image of route.querySelectorAll('[data-still]')) {
      image.src = prefix + image.dataset.still + '.jpg';
      const subject = image.dataset.still === 'layout' ? 'Matched simulated workcell' : 'Real initial workcell';
      image.alt = subject + ' · ' + button.textContent;
    }
    const videos = [...route.querySelectorAll('[data-clip]')].map(tile => {
      const path = prefix + tile.dataset.clip + '-7s';
      const video = preview({src: path + '.mp4', poster: path + '.jpg'},
        tile.nextElementSibling.textContent + ' · ' + button.textContent);
      tile.replaceChildren(video);
      return video;
    });
    motion = new MotionGroup(route, videos, 'pipeline');
    if (intent !== undefined) motion.intent = intent;
    if (time > 0) motion.seek(time);
  }

  for (const button of choices) {
    button.onclick = () => {
      if (button.getAttribute('aria-pressed') !== 'true') select(button);
    };
  }
  select(root.querySelector('[aria-pressed="true"]'));
}
