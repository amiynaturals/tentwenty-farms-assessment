
(() => {
  document.documentElement.classList.add("tr-enabled");

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function clear(el) {
    if (!el || typeof gsap === "undefined") return;
    gsap.killTweensOf(el.querySelectorAll(".tr-inner"));
  }

  function appendWords(container, content, inners) {
    const parts = content.split(/(\s+)/);
    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        container.appendChild(document.createTextNode(part));
        return;
      }
      const mask = document.createElement("span");
      mask.className = "tr-mask";
      mask.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.className = "tr-inner";
      inner.textContent = part;
      mask.appendChild(inner);
      container.appendChild(mask);
      inners.push(inner);
    });
  }

  function storeOriginal(el) {
    if (!el.hasAttribute("data-tr-html")) {
      el.setAttribute("data-tr-html", el.innerHTML);
    }
    if (!el.hasAttribute("data-tr-text")) {
      el.setAttribute(
        "data-tr-text",
        (el.textContent || "").replace(/\s+/g, " ").trim()
      );
    }
  }


  function prepare(el, text) {
    if (!el) return [];
    clear(el);
    storeOriginal(el);

    const inners = [];
    const forced =
      text != null ? String(text).replace(/\s+/g, " ").trim() : null;

    if (forced != null) {
      el.setAttribute("data-tr-text", forced);
      el.setAttribute("aria-label", forced);
      el.textContent = "";
      appendWords(el, forced, inners);
      return inners;
    }

    const rawHtml = el.getAttribute("data-tr-html") || el.innerHTML;
    const hasBreak = /<br\s*\/?>/i.test(rawHtml);
    const plain = (el.getAttribute("data-tr-text") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    el.setAttribute("aria-label", plain);
    el.innerHTML = "";

    if (!plain && !hasBreak) return [];

    if (!hasBreak) {
      appendWords(el, plain, inners);
      return inners;
    }

    const lines = rawHtml.split(/<br\s*\/?>/i);
    lines.forEach((lineHtml) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = lineHtml;
      const lineText = (tmp.textContent || "").replace(/\s+/g, " ").trim();
      const line = document.createElement("span");
      line.className = "tr-line";
      line.setAttribute("aria-hidden", "true");
      if (lineText) appendWords(line, lineText, inners);
      else line.innerHTML = "&nbsp;";
      el.appendChild(line);
    });

    return inners;
  }

  function play(el, opts = {}) {
    if (!el || typeof gsap === "undefined") return null;

    const {
      duration = 1.05,
      stagger = 0.085,
      delay = 0,
      ease = "power3.out",
      y = "110%",
      text,
    } = opts;

    let inners;
    if (text != null || !el.querySelector(".tr-inner")) {
      inners = prepare(el, text);
    } else {
      inners = Array.from(el.querySelectorAll(".tr-inner"));
    }

    if (!inners.length) return null;

    if (reduceMotion) {
      gsap.set(inners, { y: "0%" });
      return null;
    }

    gsap.killTweensOf(inners);
    return gsap.fromTo(
      inners,
      { y },
      {
        y: "0%",
        duration,
        stagger,
        delay,
        ease,
        overwrite: true,
        force3D: true,
      }
    );
  }

  function setText(el, text, opts = {}) {
    if (!el) return null;
    return play(el, { ...opts, text });
  }

  function replay(el, opts = {}) {
    if (!el) return null;
    return play(el, opts);
  }

  window.TextReveal = { prepare, play, setText, replay, clear };
})();
