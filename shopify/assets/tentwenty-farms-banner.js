(() => {
  const SWIPE_THRESHOLD = 48;
  const ZOOM_FROM = 1;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function initBanner(root) {
    let allSlides = [];
    try {
      const cfg = root.querySelector("[data-tt-farms-slides]");
      allSlides = JSON.parse(
        (cfg && cfg.textContent) || root.getAttribute("data-slides") || "[]"
      );
    } catch (e) {
      allSlides = [];
    }
    if (!allSlides.length) return;

    const slideMs = Number(root.getAttribute("data-autoplay-ms")) || 5500;
    const wipeMs = Number(root.getAttribute("data-wipe-ms")) || 2750;
    const enableZoom = root.getAttribute("data-enable-zoom") !== "false";
    const zoomAmount =
      (Number(root.getAttribute("data-zoom-amount")) || 7) / 100;
    const mobileBp = Number(root.getAttribute("data-mobile-breakpoint")) || 768;
    const ZOOM_TO = ZOOM_FROM + zoomAmount;

    root.style.setProperty("--tt-slide-duration", `${slideMs}ms`);
    root.style.setProperty("--tt-wipe-duration", `${wipeMs}ms`);

    const slidesEl = root.querySelector("[data-slides-el]");
    const nextBtn = root.querySelector("[data-next]");
    const thumbA = root.querySelector("[data-next-thumb-a]");
    const thumbB = root.querySelector("[data-next-thumb-b]");
    const progressEl = root.querySelector("[data-next-progress]");
    const barFill = root.querySelector("[data-bar-fill]");
    const counterWindow = root.querySelector("[data-counter-window]");
    const totalEl = root.querySelector("[data-total]");
    const statusEl = root.querySelector("[data-status]");
    const copyEl = root.querySelector("[data-copy]");

    if (!slidesEl || !nextBtn) return;

    if (reduceMotion) root.classList.add("tt-farms-banner--reduce-motion");

    let mq = window.matchMedia(`(max-width: ${mobileBp - 1}px)`);
    let isMobile = mq.matches;
    let slides = [];
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
    let total = 0;
    let strokeLen = 0;

    function measureStroke() {
      if (!progressEl || typeof progressEl.getTotalLength !== "function") {
        strokeLen = 376;
        return;
      }
      strokeLen = progressEl.getTotalLength() || 376;

      progressEl.style.strokeDasharray = `0 ${strokeLen}`;
      progressEl.style.strokeDashoffset = "0";
    }

    function isMobileView() {
      return mq.matches;
    }

    function filterSlides() {
      isMobile = isMobileView();
      return allSlides.filter((slide) => {
        const v = slide.visibility || "both";
        if (v === "desktop") return !isMobile;
        if (v === "mobile") return isMobile;
        return true;
      });
    }

    function slideSrc(slide) {
      if (!slide) return "";
      if (isMobile) return slide.srcMobile || slide.src;
      return slide.src;
    }

    function slideThumb(slide) {
      if (!slide) return "";
      if (isMobile) return slide.thumbMobile || slide.thumb || slide.srcMobile || slide.src;
      return slide.thumb || slide.src;
    }

    const wrap = (i) => ((i % total) + total) % total;
    const nextIndexOf = (i) => wrap(i + 1);

    function buildSlides() {
      slidesEl.innerHTML = slides
        .map(
          (slide, i) => `
      <div
        class="tt-farms-banner__slide${i === 0 ? " is-active" : ""}"
        data-slide="${i}"
        role="group"
        aria-roledescription="slide"
        aria-label="${i + 1} of ${total}"
        ${i === 0 ? "" : 'aria-hidden="true"'}
      >
        <img
          src="${slideSrc(slide)}"
          alt="${slide.alt || ""}"
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
      if (!barFill) return;
      barFill.classList.add("is-resetting");
      barFill.style.width = "0%";
      void barFill.offsetWidth;
      barFill.classList.remove("is-resetting");
    }

    function activeSlideImg() {
      return (
        slidesEl.querySelector(
          '.tt-farms-banner__slide.is-active:not(.is-entering):not([aria-hidden="true"]) img'
        ) ||
        slidesEl.querySelector(".tt-farms-banner__slide.is-active:not(.is-entering) img") ||
        slidesEl.querySelector(".tt-farms-banner__slide.is-active img")
      );
    }

    function resetZoom(node) {
      const img = node && node.querySelector("img");
      if (!img) return;
      img.style.transform = `scale(${ZOOM_FROM})`;
    }

    function applyZoom(p) {
      if (reduceMotion || !enableZoom) return;

      const img =
        slidesEl.querySelector(
          ".tt-farms-banner__slide.is-active:not(.is-entering) img"
        ) || activeSlideImg();
      if (!img) return;

      const slide = img.closest(".tt-farms-banner__slide");
      if (slide && slide.classList.contains("is-entering")) return;
      const t = easeOutCubic(p);
      const scale = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * t;
      img.style.transform = `scale(${scale})`;
    }

    function setProgress(value) {
      progress = Math.min(1, Math.max(0, value));
      if (progressEl) {
        if (!strokeLen) measureStroke();

        const drawn = strokeLen * progress;
        progressEl.style.strokeDasharray = `${drawn} ${strokeLen}`;
        progressEl.style.strokeDashoffset = "0";
      }
      if (barFill) barFill.style.width = `${progress * 100}%`;
      applyZoom(progress);
    }

    function preload(src) {
      if (!src) return;
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }

    function updateThumb() {
      const nextSlide = slides[nextIndexOf(index)];
      const src = slideThumb(nextSlide);
      nextBtn.setAttribute("aria-label", `Next slide: ${nextSlide.alt || ""}`);

      if (shownThumb.getAttribute("src") === src) return;

      if (reduceMotion) {
        shownThumb.setAttribute("src", src);
        return;
      }

      hiddenThumb.setAttribute("src", src);
      hiddenThumb.classList.add("is-shown");
      shownThumb.classList.remove("is-shown");

      const prevShown = shownThumb;
      shownThumb = hiddenThumb;
      hiddenThumb = prevShown;
    }

    function updateCounter(animate) {
      if (!counterWindow || !totalEl) return;
      const label = pad(index + 1);
      totalEl.textContent = pad(total);
      if (statusEl) statusEl.textContent = `Slide ${index + 1} of ${total}`;

      const current = counterWindow.querySelector("[data-current]");
      const shouldAnimate = animate && !reduceMotion && current;

      if (!shouldAnimate) {
        counterWindow.innerHTML = `<span class="tt-farms-banner__counter-num" data-current>${label}</span>`;
        return;
      }

      current.classList.remove("is-enter");
      current.classList.add("is-exit");
      current.removeAttribute("data-current");

      const incoming = document.createElement("span");
      incoming.className = "tt-farms-banner__counter-num is-enter";
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
      if (reduceMotion || !copyEl || typeof TextReveal === "undefined") return;
      const eyebrow = copyEl.querySelector(".tt-farms-banner__eyebrow");
      const titles = copyEl.querySelectorAll(".tt-farms-banner__title");
      if (eyebrow) {
        TextReveal.replay(eyebrow, {
          duration: 0.95,
          stagger: 0.07,
          ease: "power3.out",
        });
      }
      titles.forEach((title) => {
        TextReveal.replay(title, {
          duration: 1.15,
          stagger: 0.09,
          delay: 0.1,
          ease: "power3.out",
        });
      });
    }

    function initCopyReveal() {
      if (!copyEl || typeof TextReveal === "undefined") return;
      const eyebrow = copyEl.querySelector(".tt-farms-banner__eyebrow");
      const titles = copyEl.querySelectorAll(".tt-farms-banner__title");
      if (reduceMotion) {
        if (eyebrow) TextReveal.prepare(eyebrow);
        titles.forEach((t) => TextReveal.prepare(t));
        return;
      }
      if (eyebrow) {
        TextReveal.play(eyebrow, {
          duration: 0.95,
          stagger: 0.07,
          ease: "power3.out",
        });
      }
      titles.forEach((title) => {
        TextReveal.play(title, {
          duration: 1.15,
          stagger: 0.09,
          delay: 0.12,
          ease: "power3.out",
        });
      });
    }

    function clearWipeTimers() {
      window.clearTimeout(wipeTimer);
      wipeGeneration += 1;
    }

    function interruptWipe() {
      clearWipeTimers();
      pendingDelta = 0;
      const nodes = slidesEl.querySelectorAll(".tt-farms-banner__slide");
      nodes.forEach((node, i) => {
        node.classList.remove("is-entering");
        node.style.zIndex = "";
        const isTarget = i === index;
        node.classList.toggle("is-active", isTarget);
        node.setAttribute("aria-hidden", isTarget ? "false" : "true");
      });
      advancing = false;
    }

    function flushPending() {
      if (!pendingDelta) return;
      const delta = pendingDelta;
      pendingDelta = 0;
      goTo(index + delta, { animate: true });
    }

    function setActiveSlide(fromIndex, toIndex, withWipe, onComplete) {
      clearWipeTimers();
      const generation = wipeGeneration;
      const nodes = slidesEl.querySelectorAll(".tt-farms-banner__slide");
      const useWipe = withWipe && !reduceMotion;

      const done = () => {
        if (typeof onComplete === "function") onComplete();
        flushPending();
      };

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
        done();
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
        done();
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

        done();
      };

      next.addEventListener("animationend", (event) => {
        if (event.target !== next) return;
        onEnd();
      });
      wipeTimer = window.setTimeout(onEnd, wipeMs + 50);
    }

    function goTo(target, { animate = true } = {}) {
      if (!total) return;
      const to = wrap(target);
      const from = index;
      if (to === from && animate) return;

      if (advancing && animate) interruptWipe();

      index = to;
      cancelAnimationFrame(rafId);
      resetBar();
      setProgress(0);
      updateThumb();
      updateCounter(animate);
      preload(slideSrc(slides[to]));
      preload(slideThumb(slides[nextIndexOf(to)]));
      if (animate) replayCopy();


      setActiveSlide(from, to, animate);
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
      setProgress(elapsed / slideMs);
      if (elapsed >= slideMs) {
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

    function mount(resetIndex) {
      slides = filterSlides();
      total = slides.length;
      if (!total) return;
      if (resetIndex || index >= total) index = 0;
      cancelAnimationFrame(rafId);
      clearWipeTimers();
      advancing = false;
      measureStroke();
      buildSlides();
      shownThumb = thumbA;
      hiddenThumb = thumbB;
      thumbA.classList.add("is-shown");
      thumbB.classList.remove("is-shown");
      thumbA.setAttribute("src", slideThumb(slides[nextIndexOf(index)]));
      thumbB.setAttribute(
        "src",
        slideThumb(slides[wrap(Math.min(index + 2, total - 1))])
      );
      updateThumb();
      updateCounter(false);
      setActiveSlide(index, index, false, () => {
        startProgress();
      });
      if (resetIndex) initCopyReveal();
    }

    function onBreakpointChange() {
      const nowMobile = isMobileView();
      if (nowMobile === isMobile) {

        mount(false);
        return;
      }
      mount(true);
    }

    mount(true);

    nextBtn.addEventListener("click", () => next());
    root.addEventListener("keydown", onKeydown);
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onBreakpointChange);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(onBreakpointChange);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        startTime = performance.now() - progress * slideMs;
        rafId = requestAnimationFrame(tick);
      }
    });
  }

  function boot() {
    document
      .querySelectorAll("[data-tt-farms-banner]")
      .forEach((el) => initBanner(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("shopify:section:load", (event) => {
    const el = event.target.querySelector("[data-tt-farms-banner]");
    if (el) initBanner(el);
  });
})();
