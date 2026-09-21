(() => {
  if (typeof gsap === "undefined") {
    console.error("GSAP failed to load (tt-quality)");
    return;
  }

  const DRAG_THRESHOLD = 56;
  const MOVE_DUR = 0.95;
  const SETTLE_DUR = 0.55;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  gsap.defaults({ force3D: true, overwrite: "auto" });

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function initQuality(root) {
    const stage = root.querySelector("[data-stage]");
    const track = root.querySelector("[data-track]");
    const cursor = root.querySelector("[data-drag-cursor]");
    const dragRing = root.querySelector("[data-drag-ring]");
    const titleEl = root.querySelector("[data-title]");
    const locationEl = root.querySelector("[data-location]");
    const statusEl = root.querySelector("[data-status]");
    const slidesScript = root.querySelector("[data-tt-quality-slides]");

    if (!stage || !track || !slidesScript) return;

    let slides = [];
    try {
      slides = JSON.parse(slidesScript.textContent || "[]");
    } catch (_) {
      slides = [];
    }
    if (!slides.length) return;

    const autoplay = root.getAttribute("data-autoplay") !== "false";
    const slideMs = Math.max(
      2000,
      Number(root.getAttribute("data-autoplay-ms")) || 6500
    );
    const sideTilt = Number(root.getAttribute("data-tilt")) || 10;
    const gapSetting = Number(root.getAttribute("data-card-gap"));
    const maxCardW = Number(root.getAttribute("data-card-max")) || 340;

    if (!autoplay) root.classList.add("tt-quality--no-autoplay");
    if (reduceMotion) root.classList.add("tt-quality--reduce-motion");

    const total = slides.length;
    const proxy = { pos: 0 };
    let cards = [];
    let spacing = 280;
    let isDragging = false;
    let isAnimating = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let axisLocked = null;
    let dragFrom = 0;
    let moved = false;
    let suppressClick = false;
    let hoverInside = false;
    let progressTween = null;
    const ringProxy = { p: 0 };
    let moveTl = null;
    let cursorXTo = null;
    let cursorYTo = null;

    if (cursor) {
      gsap.set(cursor, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
      if (!reduceMotion) {
        cursorXTo = gsap.quickTo(cursor, "x", {
          duration: 0.28,
          ease: "power3.out",
        });
        cursorYTo = gsap.quickTo(cursor, "y", {
          duration: 0.28,
          ease: "power3.out",
        });
      }
    }

    const wrap = (i) => ((i % total) + total) % total;

    function shortestDelta(i, pos) {
      let d = i - pos;
      while (d > total / 2) d -= total;
      while (d <= -total / 2) d += total;
      return d;
    }

    function measure() {
      const w = stage.clientWidth || 800;
      const h = stage.clientHeight || 420;
      const cardW = Math.round(Math.min(h * 0.72, w * 0.32, maxCardW));
      root.style.setProperty("--tt-q-card-w", `${cardW}px`);
      const gapBetween = Number.isFinite(gapSetting)
        ? gapSetting
        : Math.round(Math.min(72, Math.max(40, w * 0.05)));
      spacing = cardW + gapBetween;
    }

    function setRingProgress(p) {
      if (!autoplay) {
        ringProxy.p = 0;
        if (dragRing) dragRing.style.setProperty("--p", "0");
        return;
      }
      ringProxy.p = Math.min(1, Math.max(0, p));
      if (dragRing) dragRing.style.setProperty("--p", String(ringProxy.p));
    }

    function slotProps(i, pos) {
      const t = shortestDelta(i, pos);
      const absT = Math.abs(t);
      const visible = absT <= 1.35 || (isDragging && absT <= 2.1);

      return {
        x: t * spacing,
        y: absT * 10,
        rotation: reduceMotion ? 0 : t * sideTilt,
        scale: 1 - Math.min(absT, 1.25) * 0.06,
        zIndex: Math.round(60 - absT * 18),
        autoAlpha: visible ? 1 : 0,
        t,
        absT,
        visible,
      };
    }

    function applyCardClasses(card, t) {
      const absT = Math.abs(t);
      card.classList.toggle("is-center", absT < 0.42);
      card.classList.toggle("is-side", absT >= 0.42);
      card.style.pointerEvents = absT <= 1.35 ? "auto" : "none";
    }

    function paintCards(pos) {
      cards.forEach((card, i) => {
        const s = slotProps(i, pos);
        gsap.set(card, {
          xPercent: -50,
          yPercent: -50,
          x: s.x,
          y: s.y,
          rotation: s.rotation,
          scale: s.scale,
          zIndex: s.zIndex,
          autoAlpha: s.autoAlpha,
        });
        applyCardClasses(card, s.t);
      });
    }

    function activeIndex() {
      return wrap(Math.round(proxy.pos));
    }

    function updateCopy(animate, forcedPos) {
      const idx =
        forcedPos != null ? wrap(Math.round(forcedPos)) : activeIndex();
      const slide = slides[idx];
      if (statusEl) {
        statusEl.textContent = `Slide ${idx + 1} of ${total}: ${slide.title}`;
      }
      if (!titleEl || !locationEl) return;

      if (typeof TextReveal === "undefined") {
        titleEl.textContent = slide.title;
        locationEl.textContent = slide.location;
        return;
      }

      if (!animate || reduceMotion) {
        TextReveal.prepare(titleEl, slide.title);
        TextReveal.prepare(locationEl, slide.location);
        gsap.set(titleEl.querySelectorAll(".tr-inner"), { y: "0%" });
        gsap.set(locationEl.querySelectorAll(".tr-inner"), { y: "0%" });
        return;
      }

      TextReveal.setText(titleEl, slide.title, {
        duration: 1.05,
        stagger: 0.09,
        ease: "power3.out",
      });
      TextReveal.setText(locationEl, slide.location, {
        duration: 0.9,
        stagger: 0.07,
        delay: 0.12,
        ease: "power3.out",
      });
    }

    function killProgress() {
      if (progressTween) {
        progressTween.kill();
        progressTween = null;
      }
    }

    function pauseProgress() {
      killProgress();
    }

    function startProgress() {
      killProgress();
      setRingProgress(0);
      if (!autoplay || isDragging || isAnimating) return;

      if (reduceMotion) {
        progressTween = gsap.delayedCall(slideMs / 1000, () => step(1));
        return;
      }

      progressTween = gsap.to(ringProxy, {
        p: 1,
        duration: slideMs / 1000,
        ease: "none",
        onUpdate: () => setRingProgress(ringProxy.p),
        onComplete: () => step(1),
      });
    }

    function step(dir) {
      if (isDragging) return;
      goTo(Math.round(proxy.pos) + dir);
    }

    function killMove() {
      if (moveTl) {
        moveTl.kill();
        moveTl = null;
      }
      gsap.killTweensOf(proxy);
      cards.forEach((c) => gsap.killTweensOf(c));
    }

    function goTo(targetPos) {
      const from = proxy.pos;
      const to = targetPos;
      if (Math.abs(to - from) < 0.001) return;

      killMove();
      isAnimating = true;
      pauseProgress();
      setRingProgress(0);

      updateCopy(true, to);

      const dur = reduceMotion ? 0.01 : MOVE_DUR;
      const cardProg = cards.map(() => ({ u: 0 }));

      moveTl = gsap.timeline({
        onComplete: () => {
          proxy.pos = to;
          isAnimating = false;
          moveTl = null;
          paintCards(proxy.pos);
          startProgress();
        },
      });

      cards.forEach((card, i) => {
        const start = slotProps(i, from);
        const end = slotProps(i, to);
        const phase = reduceMotion
          ? 0
          : Math.min(Math.abs(start.t), 1.15) * 0.06;

        moveTl.fromTo(
          cardProg[i],
          { u: 0 },
          {
            u: 1,
            duration: dur,
            ease: "power3.inOut",
            onUpdate: () => {
              const u = cardProg[i].u;
              const mix = (a, b) => a + (b - a) * u;
              const t = mix(start.t, end.t);
              gsap.set(card, {
                xPercent: -50,
                yPercent: -50,
                x: mix(start.x, end.x),
                y: mix(start.y, end.y),
                rotation: mix(start.rotation, end.rotation),
                scale: mix(start.scale, end.scale),
                zIndex: Math.round(mix(start.zIndex, end.zIndex)),
                autoAlpha: mix(start.autoAlpha, end.autoAlpha),
              });
              applyCardClasses(card, t);
            },
          },
          phase
        );
      });

      moveTl.to(proxy, { pos: to, duration: dur, ease: "none" }, 0);
    }

    function settleTo(target) {
      killMove();
      isAnimating = true;
      pauseProgress();

      const dur = reduceMotion ? 0.01 : SETTLE_DUR;
      const cardProg = cards.map(() => ({ u: 0 }));
      const from = proxy.pos;

      moveTl = gsap.timeline({
        onComplete: () => {
          proxy.pos = target;
          isAnimating = false;
          moveTl = null;
          paintCards(proxy.pos);
          startProgress();
        },
      });

      cards.forEach((card, i) => {
        const start = slotProps(i, from);
        const end = slotProps(i, target);

        moveTl.fromTo(
          cardProg[i],
          { u: 0 },
          {
            u: 1,
            duration: dur,
            ease: "power3.out",
            onUpdate: () => {
              const u = cardProg[i].u;
              const mix = (a, b) => a + (b - a) * u;
              gsap.set(card, {
                xPercent: -50,
                yPercent: -50,
                x: mix(start.x, end.x),
                y: mix(start.y, end.y),
                rotation: mix(start.rotation, end.rotation),
                scale: mix(start.scale, end.scale),
                zIndex: Math.round(mix(start.zIndex, end.zIndex)),
                autoAlpha: mix(start.autoAlpha, end.autoAlpha),
              });
              applyCardClasses(card, mix(start.t, end.t));
            },
          },
          0
        );
      });

      moveTl.to(proxy, { pos: target, duration: dur, ease: "none" }, 0);
    }

    function buildCards() {
      track.innerHTML = slides
        .map(
          (slide, i) => `
      <button
        type="button"
        class="tt-quality__card"
        data-card="${i}"
        aria-label="${escapeHtml(slide.title)}, ${escapeHtml(slide.location)}"
        tabindex="-1"
      >
        <img src="${escapeHtml(slide.src)}" alt="${escapeHtml(slide.alt)}" width="720" height="960" decoding="async" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
      </button>`
        )
        .join("");

      cards = Array.from(track.querySelectorAll("[data-card]"));
      cards.forEach((card) => {
        gsap.set(card, {
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
          transformOrigin: "50% 50%",
        });
      });
    }

    function directionFromPointer(clientX) {
      if (!cursor) return 1;
      const rect = cursor.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      return clientX >= mid ? 1 : -1;
    }

    function navigateFromClick(clientX) {
      step(directionFromPointer(clientX));
    }

    function updateKeyHighlight(clientX) {
      if (!cursor) return;
      const dir = directionFromPointer(clientX);
      cursor.classList.toggle("is-next", dir > 0);
      cursor.classList.toggle("is-prev", dir < 0);
    }

    function moveCursor(clientX, clientY) {
      if (!cursor) return;
      const rect = stage.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (cursorXTo && cursorYTo) {
        cursorXTo(x);
        cursorYTo(y);
      } else {
        gsap.set(cursor, { x, y, xPercent: -50, yPercent: -50 });
      }
      updateKeyHighlight(clientX);
    }

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;

      if (isAnimating) {
        killMove();
        proxy.pos = Math.round(proxy.pos);
        paintCards(proxy.pos);
        isAnimating = false;
      }

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      axisLocked = null;
      moved = false;
      isDragging = false;
      dragFrom = proxy.pos;
      moveCursor(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
      if (hoverInside || isDragging) moveCursor(e.clientX, e.clientY);
      if (e.pointerId !== pointerId || pointerId == null) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!axisLocked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axisLocked === "y") {
          pointerId = null;
          axisLocked = null;
          return;
        }
        isDragging = true;
        stage.classList.add("is-dragging", "is-hover");
        pauseProgress();
        try {
          stage.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      if (axisLocked !== "x" || !isDragging) return;

      e.preventDefault();
      moved = Math.abs(dx) > 10;
      const max = 0.92;
      const deltaSlides = Math.max(-max, Math.min(max, -dx / spacing));
      proxy.pos = dragFrom + deltaSlides;
      paintCards(proxy.pos);
    }

    function endDrag(commit, clientX) {
      if (pointerId == null && !isDragging) return;

      const wasDragging = isDragging;
      isDragging = false;
      stage.classList.remove("is-dragging");

      try {
        if (pointerId != null) stage.releasePointerCapture(pointerId);
      } catch (_) {}

      const slideDelta = proxy.pos - dragFrom;
      const clickX = clientX != null ? clientX : startX;
      const locked = axisLocked;
      pointerId = null;
      axisLocked = null;

      if (!wasDragging || locked === "y") {
        if (commit && !moved && locked !== "y") {
          navigateFromClick(clickX);
        }
        return;
      }

      const wasClick = !moved && Math.abs(slideDelta) < 0.04;

      if (wasClick && commit) {
        suppressClick = true;
        proxy.pos = Math.round(dragFrom);
        paintCards(proxy.pos);
        navigateFromClick(clickX);
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        return;
      }

      suppressClick = moved;

      if (commit && Math.abs(slideDelta) * spacing >= DRAG_THRESHOLD) {
        const dir = slideDelta > 0 ? 1 : -1;
        goTo(Math.round(dragFrom) + dir);
      } else {
        settleTo(Math.round(dragFrom));
      }

      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }

    function onPointerUp(e) {
      if (e.pointerId !== pointerId) return;
      endDrag(true, e.clientX);
    }

    function onPointerCancel(e) {
      if (e.pointerId !== pointerId) return;
      endDrag(false, e.clientX);
    }

    function onKeydown(e) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    }

    stage.addEventListener("pointerenter", (e) => {
      hoverInside = true;
      stage.classList.add("is-hover");
      moveCursor(e.clientX, e.clientY);
    });

    stage.addEventListener("pointerleave", () => {
      hoverInside = false;
      if (!isDragging) stage.classList.remove("is-hover");
    });

    const ro = new ResizeObserver(() => {
      measure();
      paintCards(proxy.pos);
    });
    ro.observe(stage);

    measure();
    buildCards();
    paintCards(0);
    updateCopy(false);

    const introTitle = root.querySelector("[data-intro-title]");
    const introBody = root.querySelector("[data-intro-body]");
    if (typeof TextReveal !== "undefined") {
      if (introTitle) {
        TextReveal.play(introTitle, {
          duration: 1.1,
          stagger: 0.1,
          ease: "power3.out",
        });
      }
      if (introBody) {
        TextReveal.play(introBody, {
          duration: 0.85,
          stagger: 0.045,
          delay: 0.18,
          ease: "power3.out",
        });
      }
    }

    startProgress();

    stage.addEventListener("pointerdown", onPointerDown);
    stage.addEventListener("pointermove", onPointerMove);
    stage.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointercancel", onPointerCancel);
    stage.addEventListener("keydown", onKeydown);

    track.addEventListener("click", (e) => {
      e.preventDefault();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseProgress();
      else if (!isDragging && !isAnimating) startProgress();
    });
  }

  document.querySelectorAll("[data-tt-quality]").forEach(initQuality);
})();
