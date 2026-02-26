import { vertexShader, fragmentShader } from "./shaders.js";

import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText);

const lenis = new Lenis();
function raf(time) {
  lenis.raf(time);
  ScrollTrigger.update();
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
lenis.on("scroll", ScrollTrigger.update);

const CONFIG = {
  color: "#ebf5df",
  spread: 0.5,
  speed: 2,
};

const canvas = document.querySelector(".hero-canvas");
const hero = document.querySelector(".hero");

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: false,
});

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0.89, g: 0.89, b: 0.89 };
}

function resize() {
  const width = hero.offsetWidth;
  const height = hero.offsetHeight;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

resize();
window.addEventListener("resize", resize);

const rgb = hexToRgb(CONFIG.color);
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uProgress: { value: 0 },
    uResolution: {
      value: new THREE.Vector2(hero.offsetWidth, hero.offsetHeight),
    },
    uColor: { value: new THREE.Vector3(rgb.r, rgb.g, rgb.b) },
    uSpread: { value: CONFIG.spread },
  },
  transparent: true,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

let scrollProgress = 0;

function animate() {
  material.uniforms.uProgress.value = scrollProgress;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

lenis.on("scroll", ({ scroll }) => {
  const heroHeight = hero.offsetHeight;
  const windowHeight = window.innerHeight;
  const maxScroll = heroHeight - windowHeight;
  scrollProgress = Math.min((scroll / maxScroll) * CONFIG.speed, 1.1);
});

window.addEventListener("resize", () => {
  material.uniforms.uResolution.value.set(hero.offsetWidth, hero.offsetHeight);
});

const heroH2 = document.querySelector(".hero-content h2");
const split = new SplitText(heroH2, { type: "words" });
const words = split.words;

gsap.set(words, { opacity: 0 });

ScrollTrigger.create({
  trigger: ".hero-content",
  start: "top 25%",
  end: "bottom 100%",
  onUpdate: (self) => {
    const progress = self.progress;
    const totalWords = words.length;

    words.forEach((word, index) => {
      const wordProgress = index / totalWords;
      const nextWordProgress = (index + 1) / totalWords;

      let opacity = 0;

      if (progress >= nextWordProgress) {
        opacity = 1;
      } else if (progress >= wordProgress) {
        const fadeProgress =
          (progress - wordProgress) / (nextWordProgress - wordProgress);
        opacity = fadeProgress;
      }

      gsap.to(word, {
        opacity: opacity,
        duration: 0.1,
        overwrite: true,
      });
    });
  },
});
