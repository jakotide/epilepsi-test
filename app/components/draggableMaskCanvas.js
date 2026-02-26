// GRAB VIDEO, MASKCONTAINERS, GLOBALHUD if needed

let isHoveringMask = false;

const state = new Map();

document.addEventListener("mousemove", (e) => {
  if (!isHoveringMask) {
    // If we want coordinates. Not needed.
  }
});

function drawClipped(ctx, video, rect) {
  const videoAspect = video.videoWidth / video.videoHeight;
  const windowAspect = window.innerWidth / window.innerHeight;

  let dw, dh, dx, dy;

  if (videoAspect > windowAspect) {
    dh = window.innerHeight;
    dw = dh * videoAspect;
    dx = (window.innerWidth - dw) / 2;
    dy = 0;
  } else {
    dh = window.innerWidth;
    dw = dh / videoAspect;
    dx = 0;
    dy = (window.innerHeight - dh) / 2;
  }

  const scaleX = video.videoWidth / dw;
  const scaleY = video.videoHeight / dh;

  ctx.drawImage(
    video,
    (rect.x - dx) * scaleX,
    (rect.y - dy) * scaleY,
    rect.w * scaleX,
    rect.h * scaleY,
    0,
    0,
    rect.w,
    rect.h,
  );
}

function initMasks() {
  MaskPass.forEach((mask) => {
    const r = mask.getBoundingClientRect();

    state.set(mask, {
      x: r.left,
      y: r.top,
    });
  });
}

function initCanvases() {}

function draw() {
  MaskPass.forEach((mask) => {
    const s = state.get(mask);
    const canvas = mask.querySelector("canvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawClipped(ctx, video, s);
  });

  requestAnimationFrame(draw);
}
