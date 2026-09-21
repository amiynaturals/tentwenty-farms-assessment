(() => {
  const SLIDE_MS = 5500;
  const SWIPE_THRESHOLD = 48;

  const slides = [
    {
      src: "./assets/slides/01.jpg",
      alt: "Green crop rows stretching toward rolling hills under a cloudy sky",
    },
    {
      src: "./assets/slides/02.jpg",
      alt: "Farm path through greenery toward open water",
    },
    {
      src: "./assets/slides/03.jpg",
      alt: "Sunlit agricultural crops in open fields",
    },
    {
      src: "./assets/slides/04.jpg",
      alt: "Agricultural fields at golden hour",
    },
  ];

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const root = document.querySelector(".banner");
  const slidesEl = root.querySelector("[data-slides]");
  const nextBtn = root.querySelector("[data-next]");
  const thumbA = root.querySelector("[data-next-thumb-a]");
  const thumbB = root.querySelector("[data-next-thumb-b]");
  const progressRect = root.querySelector("[data-next-progress]");
  const barFill = root.querySelector("[data-bar-fill]");
  const counterWindow = root.querySelector("[data-counter-window]");
  const totalEl = root.querySelector("[data-total]");
  const statusEl = root.querySelector("[data-status]");
  const copyEl = root.querySelector(".banner__copy");

  if (reduceMotion) root.classList.add("banner--reduce-motion");

  const total = slides.length;
  let index = 0;
  let rafId = 0;
  let startTime = 0;
  let progress = 0;
  let advancing = false;
  let wipeTimer = 0;
  let wipeGeneration = 0;
  let pendingDelta = 0;
  let shownThumb = thumbA;
  let hiddenThumb = thumbB;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  const pad = (n) => String(n).padStart(2, "0");
  const wrap = (i) => ((i % total) + total) % total;
  const nextIndexOf = (i) => wrap(i + 1);

  function buildSlides() {
    slidesEl.innerHTML = slides
      .map(
        (slide, i) => `
      <div
        class="banner__slide${i === 0 ? " is-active" : ""}"
        data-slide="${i}"
        role="group"
        aria-roledescription="slide"
        aria-label="${i + 1} of ${total}"
        ${i === 0 ? "" : 'aria-hidden="true"'}
      >
        <img
          src="${slide.src}"
          alt="${slide.alt}"
          width="1920"
          height="1080"
          ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}
          decoding="async"
        />
      </div>`
      )
      .join("");
  }

  function resetBar() {
    barFill.classList.add("is-resetting");
    barFill.style.width = "0%";
    void barFill.offsetWidth;
    barFill.classList.remove("is-resetting");
  }

  const ZOOM_FROM = 1;
  const ZOOM_TO = 1.07;
  const WIPE_MS = 2750;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function activeSlideImg() {
    return (
      slidesEl.querySelector(".banner__slide.is-entering img") ||
      slidesEl.querySelector('.banner__slide.is-active:not([aria-hidden="true"]) img') ||
      slidesEl.querySelector(".banner__slide.is-active img")
    );
  }

  function resetZoom(node) {
    const img = node && node.querySelector("img");
    if (!img) return;
    img.style.transform = `scale(${ZOOM_FROM})`;
  }


  function applyZoom(p) {
    if (reduceMotion) return;
    const img = activeSlideImg();
    if (!img) return;
    const t = easeOutCubic(p);
    const scale = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * t;
    img.style.transform = `scale(${scale})`;
  }

  function setProgress(value) {
    progress = Math.min(1, Math.max(0, value));
    progressRect.setAttribute(
      "stroke-dashoffset",
      String(100 * (1 - progress))
    );
    barFill.style.width = `${progress * 100}%`;
    applyZoom(progress);
  }

  function updateThumb() {
    const nextSlide = slides[nextIndexOf(index)];
    nextBtn.setAttribute("aria-label", `Next slide: ${nextSlide.alt}`);

    if (shownThumb.getAttribute("src") === nextSlide.src) return;

    if (reduceMotion) {
      shownThumb.setAttribute("src", nextSlide.src);
      return;
    }

    hiddenThumb.setAttribute("src", nextSlide.src);
    hiddenThumb.classList.add("is-shown");
    shownThumb.classList.remove("is-shown");

    const prevShown = shownThumb;
    shownThumb = hiddenThumb;
    hiddenThumb = prevShown;
  }

  function updateCounter(animate) {
    const label = pad(index + 1);
    totalEl.textContent = pad(total);
    statusEl.textContent = `Slide ${index + 1} of ${total}`;

    const current = counterWindow.querySelector("[data-current]");
    const shouldAnimate = animate && !reduceMotion && current;

    if (!shouldAnimate) {
      counterWindow.innerHTML = `<span class="banner__counter-num" data-current>${label}</span>`;
      return;
    }

    current.classList.remove("is-enter");
    current.classList.add("is-exit");
    current.removeAttribute("data-current");

    const incoming = document.createElement("span");
    incoming.className = "banner__counter-num is-enter";
    incoming.setAttribute("data-current", "");
    incoming.textContent = label;
    counterWindow.appendChild(incoming);

    const finish = () => {
      if (current.parentNode) current.remove();
      incoming.classList.remove("is-enter");
    };

    incoming.addEventListener("animationend", finish, { once: true });
    window.setTimeout(finish, 1700);
  }

  function replayCopy() {
    if (reduceMotion || typeof TextReveal === "undefined") return;
    const eyebrow = copyEl.querySelector(".banner__eyebrow");
    const title = copyEl.querySelector(".banner__title");
    TextReveal.replay(eyebrow, {
      duration: 0.95,
      stagger: 0.07,
      ease: "power3.out",
    });
    TextReveal.replay(title, {
      duration: 1.15,
      stagger: 0.09,
      delay: 0.1,
      ease: "power3.out",
    });
  }

  function initCopyReveal() {
    if (typeof TextReveal === "undefined") return;
    const eyebrow = copyEl.querySelector(".banner__eyebrow");
    const title = copyEl.querySelector(".banner__title");
    if (reduceMotion) {
      TextReveal.prepare(eyebrow);
      TextReveal.prepare(title);
      return;
    }
    TextReveal.play(eyebrow, {
      duration: 0.95,
      stagger: 0.07,
      ease: "power3.out",
    });
    TextReveal.play(title, {
      duration: 1.15,
      stagger: 0.09,
      delay: 0.12,
      ease: "power3.out",
    });
  }

  function clearWipeTimers() {
    window.clearTimeout(wipeTimer);
    wipeGeneration += 1;
  }


  function interruptWipe() {
    clearWipeTimers();
    pendingDelta = 0;
    const nodes = slidesEl.querySelectorAll(".banner__slide");
    nodes.forEach((node, i) => {
      node.classList.remove("is-entering");
      node.style.zIndex = "";
      const isTarget = i === index;
      node.classList.toggle("is-active", isTarget);
      node.setAttribute("aria-hidden", isTarget ? "false" : "true");
    });
    advancing = false;
  }

  function setActiveSlide(fromIndex, toIndex, withWipe) {
    clearWipeTimers();
    const generation = wipeGeneration;
    const nodes = slidesEl.querySelectorAll(".banner__slide");
    const useWipe = withWipe && !reduceMotion;

    nodes.forEach((node, i) => {
      node.classList.remove("is-entering");
      node.style.zIndex = "";
      const isTarget = i === toIndex;
      node.classList.toggle("is-active", isTarget);
      node.setAttribute("aria-hidden", isTarget ? "false" : "true");
    });

    if (!useWipe) {
      resetZoom(nodes[toIndex]);
      applyZoom(0);
      advancing = false;
      flushPending();
      return;
    }

    const prev = nodes[fromIndex];
    const next = nodes[toIndex];
    advancing = true;

    if (prev && prev !== next) {
      prev.classList.add("is-active");
      prev.style.zIndex = "1";
      prev.setAttribute("aria-hidden", "true");
    }

    if (!next) {
      advancing = false;
      flushPending();
      return;
    }

    resetZoom(next);
    next.classList.add("is-entering", "is-active");
    next.style.zIndex = "2";
    next.setAttribute("aria-hidden", "false");

    let settled = false;
    const onEnd = () => {
      if (generation !== wipeGeneration || settled) return;
      settled = true;
      next.classList.remove("is-entering");
      next.style.zIndex = "";
      if (prev && prev !== next) {
        prev.classList.remove("is-active");
        prev.style.zIndex = "";
      }
      advancing = false;
      flushPending();
    };

    next.addEventListener("animationend", (event) => {
      if (event.target !== next) return;
      onEnd();
    });
    wipeTimer = window.setTimeout(onEnd, WIPE_MS + 50);
  }

  function flushPending() {
    if (!pendingDelta) return;
    const delta = pendingDelta;
    pendingDelta = 0;
    goTo(index + delta, { animate: true });
  }

  function goTo(target, { animate = true } = {}) {
    const to = wrap(target);
    const from = index;

    if (to === from && animate) return;


    if (advancing && animate) {
      interruptWipe();
    }

    index = to;
    cancelAnimationFrame(rafId);
    resetBar();
    setProgress(0);
    updateThumb();
    updateCounter(animate);
    setActiveSlide(from, to, animate);
    if (animate) replayCopy();
    startProgress();
  }

  function next() {
    goTo(index + 1, { animate: true });
  }

  function prev() {
    goTo(index - 1, { animate: true });
  }

  function tick(now) {
    const elapsed = now - startTime;
    setProgress(elapsed / SLIDE_MS);
    if (elapsed >= SLIDE_MS) {
      next();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startProgress() {
    cancelAnimationFrame(rafId);
    startTime = performance.now();
    setProgress(0);
    rafId = requestAnimationFrame(tick);
  }

  function onKeydown(e) {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    touchActive = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    if (!touchActive || !e.changedTouches.length) return;
    touchActive = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  }

  buildSlides();
  totalEl.textContent = pad(total);
  shownThumb.setAttribute("src", slides[nextIndexOf(0)].src);
  hiddenThumb.setAttribute("src", slides[wrap(2)].src);
  updateThumb();
  updateCounter(false);
  setActiveSlide(0, 0, false);
  initCopyReveal();
  startProgress();

  nextBtn.addEventListener("click", () => next());
  root.addEventListener("keydown", onKeydown);
  root.addEventListener("touchstart", onTouchStart, { passive: true });
  root.addEventListener("touchend", onTouchEnd, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      startTime = performance.now() - progress * SLIDE_MS;
      rafId = requestAnimationFrame(tick);
    }
  });
})();
