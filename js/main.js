/*
 * Pró Saúde Academia — conceito "Maré"
 * Coreografia de motion: GSAP + ScrollTrigger + Lenis.
 *
 * Princípio de robustez: o HTML/CSS já entrega o conteúdo totalmente
 * visível e legível sem nenhuma linha deste arquivo (progressive
 * enhancement). Tudo aqui parte de um estado visível e só esconde um
 * elemento (via gsap.set) imediatamente antes de animá-lo. Se o GSAP
 * não carregar, ou se prefers-reduced-motion estiver ativo, o usuário
 * simplesmente vê a página estática — nunca um elemento "preso"
 * invisível.
 */
(function () {
  "use strict";

  /* -----------------------------------------------------------------
     Menu mobile — não depende de GSAP, sempre funcional
     ----------------------------------------------------------------- */
  (function initMobileNav() {
    var toggle = document.querySelector(".nav-toggle");
    var panel = document.getElementById("mobileNav");
    if (!toggle || !panel) return;

    toggle.addEventListener("click", function () {
      var isOpen = !panel.hasAttribute("hidden");
      if (isOpen) {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      } else {
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
      }
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  })();

  /* -----------------------------------------------------------------
     Progresso de scroll + item ativo do menu — puro JS/CSS, sem GSAP,
     pra continuar funcionando mesmo se o CDN do GSAP falhar.
     ----------------------------------------------------------------- */
  (function initScrollProgressAndNav() {
    var bar = document.querySelector(".scroll-progress__bar");
    var navLinks = document.querySelectorAll("[data-nav-link]");
    var sections = [];
    navLinks.forEach(function (link) {
      var id = link.getAttribute("href");
      var el = id && id.charAt(0) === "#" ? document.querySelector(id) : null;
      if (el) sections.push({ id: id, el: el, links: [] });
    });
    navLinks.forEach(function (link) {
      var id = link.getAttribute("href");
      var group = sections.filter(function (s) {
        return s.id === id;
      })[0];
      if (group) group.links.push(link);
    });

    if (!bar && !sections.length) return;

    function update() {
      var doc = document.documentElement;
      var scrollTop = window.scrollY || doc.scrollTop;
      var max = (doc.scrollHeight || 0) - window.innerHeight;
      if (bar) {
        var pct = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0;
        bar.style.width = pct * 100 + "%";
      }
      if (sections.length) {
        var current = null;
        for (var i = 0; i < sections.length; i++) {
          var rect = sections[i].el.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.4) current = sections[i];
        }
        sections.forEach(function (s) {
          s.links.forEach(function (link) {
            link.classList.toggle("is-active", s === current);
          });
        });
      }
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  })();

  /* -----------------------------------------------------------------
     CTAs primários — a "mancha" de luz do hover nasce da posição real
     do cursor dentro do botão (via --mx/--my), em vez de um hover
     genérico só de cor. Puro JS/CSS, sem GSAP.
     ----------------------------------------------------------------- */
  (function initMagneticButtons() {
    document.querySelectorAll(".btn--primary").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var rect = btn.getBoundingClientRect();
        btn.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width) * 100 + "%");
        btn.style.setProperty("--my", ((e.clientY - rect.top) / rect.height) * 100 + "%");
      });
    });
  })();

  /* -----------------------------------------------------------------
     A partir daqui, tudo depende do GSAP. Sem ele, a página continua
     100% navegável e legível — só não ganha a coreografia.
     ----------------------------------------------------------------- */
  if (typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  var prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* -----------------------------------------------------------------
     Smooth scroll (Lenis) — desligado sob reduced motion: o scroll
     nativo do navegador assume, sem física customizada.
     ----------------------------------------------------------------- */
  if (!prefersReduced && typeof Lenis !== "undefined") {
    var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  // Fontes variáveis (Newsreader) chegam depois do primeiro layout —
  // recalcula posições de scroll quando elas terminam de carregar.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      ScrollTrigger.refresh();
    });
  }

  /* -----------------------------------------------------------------
     Helpers reutilizados por várias seções
     ----------------------------------------------------------------- */

  // Desenha um <path> de dentro para fora (stroke-dashoffset), a
  // "linha de pulso" que atravessa o site como fio condutor.
  function drawPath(svgEl, delay) {
    var path = svgEl && svgEl.querySelector("path");
    if (!path) return;
    var length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 1.8,
      delay: delay || 0,
      ease: "power2.inOut",
    });
  }

  // Anima o eixo de peso ("wght") de uma fonte variável — a
  // "tipografia cinética": o título ganha solidez com o tempo, em vez
  // de simplesmente aparecer.
  function animateWeight(el, from, to, opts) {
    opts = opts || {};
    var obj = { w: from };
    el.style.fontVariationSettings = '"wght" ' + from;
    gsap.to(obj, {
      w: to,
      duration: opts.duration || 1.4,
      delay: opts.delay || 0,
      ease: opts.ease || "power2.out",
      onUpdate: function () {
        el.style.fontVariationSettings = '"wght" ' + Math.round(obj.w);
      },
    });
  }

  /* -----------------------------------------------------------------
     Hero — chegada da experiência
     ----------------------------------------------------------------- */
  (function initHero() {
    if (prefersReduced) return;

    var wave = document.querySelector(".hero__wave");
    var title = document.querySelector('[data-anim="hero-title"]');
    var fadeEls = document.querySelectorAll('[data-anim="hero-fade"]');

    if (wave) drawPath(wave, 0.1);
    if (title) animateWeight(title, 260, 480, { duration: 1.6, delay: 0.5 });

    if (fadeEls.length) {
      gsap.set(fadeEls, { opacity: 0, y: 18 });
      gsap.to(fadeEls, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        delay: 0.9,
      });
    }
  })();

  /* -----------------------------------------------------------------
     Halo de cursor — só em dispositivos com ponteiro fino e hover,
     e só com motion habilitado. Nunca aparece em touch.
     ----------------------------------------------------------------- */
  var mm = gsap.matchMedia();

  mm.add("(hover: hover) and (pointer: fine)", function () {
    if (prefersReduced) return;
    var halo = document.querySelector(".cursor-halo");
    if (!halo) return;

    gsap.set(halo, { opacity: 1 });
    var xTo = gsap.quickTo(halo, "x", { duration: 0.5, ease: "power3" });
    var yTo = gsap.quickTo(halo, "y", { duration: 0.5, ease: "power3" });

    function onMove(e) {
      xTo(e.clientX);
      yTo(e.clientY);
    }
    window.addEventListener("mousemove", onMove);

    var pulse = gsap.to(halo, {
      scale: 1.25,
      repeat: -1,
      yoyo: true,
      duration: 1.6,
      ease: "sine.inOut",
    });

    // gsap.matchMedia chama esta função de volta se a media query
    // deixar de bater (ex.: usuário conecta um mouse a um tablet).
    return function () {
      window.removeEventListener("mousemove", onMove);
      pulse.kill();
    };
  });

  /* -----------------------------------------------------------------
     Manifesto — texto revelado por máscara, no ritmo do hero
     ----------------------------------------------------------------- */
  (function initManifesto() {
    if (prefersReduced) return;
    var lines = document.querySelectorAll(".manifesto .reveal-line");
    if (!lines.length) return;

    gsap.set(lines, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: ".manifesto",
      start: "top 70%",
      once: true,
      onEnter: function () {
        gsap.to(lines, {
          yPercent: 0,
          duration: 0.9,
          ease: "power4.out",
          stagger: 0.08,
        });
      },
    });
  })();

  /* -----------------------------------------------------------------
     Metodologia — jornada em "estações" + trilho com ponto viajante
     ----------------------------------------------------------------- */
  (function initMethodology() {
    if (prefersReduced) return;

    var rows = document.querySelectorAll(".method-row");
    rows.forEach(function (row) {
      gsap.set(row, { opacity: 0, y: 26 });
      ScrollTrigger.create({
        trigger: row,
        start: "top 85%",
        once: true,
        onEnter: function () {
          gsap.to(row, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" });
        },
      });
    });

    var dot = document.querySelector(".methodology__rail-dot");
    var rowsContainer = document.querySelector(".methodology__rows");
    if (dot && rowsContainer) {
      gsap.to(dot, {
        top: "100%",
        ease: "none",
        scrollTrigger: {
          trigger: rowsContainer,
          start: "top center",
          end: "bottom center",
          scrub: true,
        },
      });
    }
  })();

  /* -----------------------------------------------------------------
     Cuidado / Estrutura — profundidade discreta (parallax) nas
     fotos-placeholder. Cada bloco se move em velocidade própria.
     ----------------------------------------------------------------- */
  (function initCare() {
    if (prefersReduced) return;
    document.querySelectorAll('[data-anim="parallax"]').forEach(function (tile) {
      var speed = parseFloat(tile.getAttribute("data-speed")) || 1;
      gsap.to(tile, {
        yPercent: 8 * speed,
        ease: "none",
        scrollTrigger: { trigger: tile, scrub: true },
      });
    });
  })();

  /* -----------------------------------------------------------------
     Prova social — contador de 0 a 4,8, traçado do pulso, pull-quote
     ----------------------------------------------------------------- */
  (function initSocialProof() {
    var counter = document.querySelector('[data-anim="counter"]');
    // O valor final (ex.: "4,8") já está escrito no HTML como estado
    // padrão — só o reescrevemos para "0,0" bem no instante em que a
    // contagem animada vai começar, nunca antes disso.
    if (counter && !prefersReduced) {
      var target = parseFloat(counter.getAttribute("data-target")) || 0;
      var obj = { val: 0 };
      ScrollTrigger.create({
        trigger: counter,
        start: "top 85%",
        once: true,
        onEnter: function () {
          counter.textContent = "0,0";
          gsap.to(obj, {
            val: target,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: function () {
              counter.textContent = obj.val.toFixed(1).replace(".", ",");
            },
          });
        },
      });
    }

    var wave = document.querySelector(".social-proof__wave");
    if (wave && !prefersReduced) {
      ScrollTrigger.create({
        trigger: wave,
        start: "top 85%",
        once: true,
        onEnter: function () {
          drawPath(wave, 0);
        },
      });
    }
  })();

  /* -----------------------------------------------------------------
     Linhas verticais que "crescem" (divisor do manifesto, régua da
     citação) — um único handler genérico para os dois casos.
     ----------------------------------------------------------------- */
  if (!prefersReduced) {
    document.querySelectorAll('[data-anim="grow-v"]').forEach(function (el) {
      gsap.set(el, { scaleY: 0 });
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: function () {
          gsap.to(el, { scaleY: 1, duration: 1, ease: "power3.out" });
        },
      });
    });
  }

  /* -----------------------------------------------------------------
     CTA final — a linha de pulso fecha o ciclo aberto no hero
     ----------------------------------------------------------------- */
  (function initFinalCta() {
    var wave = document.querySelector(".final-cta__wave");
    if (wave && !prefersReduced) {
      ScrollTrigger.create({
        trigger: wave,
        start: "top 85%",
        once: true,
        onEnter: function () {
          drawPath(wave, 0);
        },
      });
    }
  })();

  /* -----------------------------------------------------------------
     CTA fixa (mobile) — aparece assim que o hero sai da tela
     ----------------------------------------------------------------- */
  (function initStickyCta() {
    var sticky = document.getElementById("stickyCta");
    var hero = document.querySelector(".hero");
    if (!sticky || !hero) return;

    ScrollTrigger.create({
      trigger: hero,
      start: "bottom top",
      onEnter: function () {
        sticky.classList.add("is-visible");
      },
      onLeaveBack: function () {
        sticky.classList.remove("is-visible");
      },
    });
  })();
})();
