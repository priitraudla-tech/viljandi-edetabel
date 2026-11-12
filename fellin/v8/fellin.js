// Fellin Rackets — ühine skript kõigile lehtedele (versioon 8).
// Iga osa käivitub ainult siis, kui lehel on vastav element olemas.
// Põhisisu (hinnad, treenerid, KKK, edetabeli viimane seis) on HTML-is ja loetav ka ilma skriptita.
(function () {
  "use strict";

  const EDETABEL = "https://viljandi-edetabel.pages.dev";
  const TZ = "Europe/Tallinn";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtKuupaev = (iso) => new Intl.DateTimeFormat("et-EE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  const fmtAeg = (iso) => new Intl.DateTimeFormat("et-EE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  // ---------- Lahtiolek ja hooaeg Tallinna aja järgi ----------
  const now = new Date();
  const tund = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  const kuu = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "numeric" }).format(now));
  const hall = $("#hall-status");
  if (hall) {
    const lahti = tund >= 6;
    hall.textContent = lahti ? "Sisehall Kaalu 2 on praegu lahti · sisse saab uksekoodiga" : "Sisehall Kaalu 2 on kinni · avatakse kell 6";
    const dot = $("#hall-dot");
    if (dot) dot.classList.toggle("off", !lahti);
  }
  const hooaeg = $("#out-season");
  if (hooaeg) {
    const valjas = kuu >= 5 && kuu <= 10;
    hooaeg.textContent = valjas ? "Hooaeg käib, lahti maist oktoobrini" : "Praegu kinni, hooaeg maist oktoobrini";
    hooaeg.classList.toggle("off", !valjas);
  }

  // ---------- Menüü: arvutis rida päises, telefonis avatav paneel (klass .open) ----------
  const nupp = $("#menu-btn"), menuu = $("#nav");
  if (nupp && menuu) {
    const lahti = () => menuu.classList.contains("open");
    const sea = (ava, fookus) => {
      menuu.classList.toggle("open", ava);
      nupp.setAttribute("aria-expanded", String(ava));
      if (!ava && fookus) nupp.focus();
    };
    nupp.addEventListener("click", () => sea(!lahti()));
    menuu.addEventListener("click", (e) => { if (e.target.closest("a")) sea(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && lahti()) sea(false, true); });
    document.addEventListener("click", (e) => { if (lahti() && !e.target.closest(".top")) sea(false); });
    matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) sea(false); });
  }

  // ---------- Avaleht: päis on foto peal läbipaistev, kerides muutub tumedaks ----------
  const pais = $(".top"), foto = $(".hero");
  if (pais && foto && "IntersectionObserver" in window) {
    const valvur = document.createElement("div");
    valvur.style.cssText = "position:absolute;top:0;left:0;width:1px;height:" + Math.round(pais.offsetHeight * 1.5) + "px;pointer-events:none";
    foto.prepend(valvur);
    new IntersectionObserver(([e]) => pais.classList.toggle("is-clear", e.isIntersecting),
      { rootMargin: "-" + pais.offsetHeight + "px 0px 0px 0px" }).observe(valvur);
  }

  // ---------- VÜS edetabel ja püramiid: värske seis peale, värskus ausalt näha ----------
  const vusList = $("#vus-list"), pyrList = $("#pyr-list"), pyrTop = $("#pyr-top"), olekEl = $("#data-status");
  function delta(d) {
    if (d > 0) return `<span class="dl up"><i aria-hidden="true"></i>${d}<span class="vh"> kohta üles</span></span>`;
    if (d < 0) return `<span class="dl down"><i aria-hidden="true"></i>${-d}<span class="vh"> kohta alla</span></span>`;
    return `<span class="dl eq"><span aria-hidden="true">–</span><span class="vh">muutuseta</span></span>`;
  }
  function olek(tyyp, html) {
    if (!olekEl) return;
    olekEl.className = "data-status " + tyyp;
    olekEl.innerHTML = html;
  }
  async function laeJson(tee, signal) {
    const r = await fetch(EDETABEL + tee, { signal, cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  if (vusList || pyrList || pyrTop) {
    (async function () {
      const varuSeis = olekEl ? olekEl.dataset.asof : "";
      try {
        const ctl = new AbortController();
        setTimeout(() => ctl.abort(), 6000);
        const [cur, pyr] = await Promise.all([
          vusList ? laeJson("/data/current.json", ctl.signal) : null,
          pyrList || pyrTop ? laeJson("/data/puramiid.json", ctl.signal) : null,
        ]);
        let asof = "";
        if (cur) {
          asof = (cur.title.match(/\(([\d.]+)/) || [])[1] || "";
          const n = Number(vusList.dataset.n) || 5;
          const top = cur.players.slice(0, n);
          vusList.innerHTML = top.length ? top.map((p, i) =>
            `<li><span class="rk num" aria-hidden="true">${i + 1}</span><span>${esc(p.name)}</span>` +
            `<span class="pts num">${p.total} p</span>${delta(p.rank_delta || 0)}</li>`).join("")
            : `<li><span class="empty">Tulemusi veel pole.</span></li>`;
          const a = $("#vus-asof");
          if (a) a.textContent = asof ? `seis ${asof}` : "seis";
        }
        if (pyr) {
          const jarjest = pyr.players.slice().sort((x, y) => x.pos - y.pos);
          const seis = pyr.updated_at ? fmtKuupaev(pyr.updated_at) : "";
          if (pyrList) {
            const n = Number(pyrList.dataset.n) || 6;
            pyrList.innerHTML = jarjest.length ? jarjest.slice(0, n).map((p, i) =>
              `<li><span class="rk num" aria-hidden="true">${i + 1}</span>` +
              `<span>${esc(p.name)}${i === 0 ? '<span class="vh"> (püramiidi tipp)</span>' : ""}</span></li>`).join("")
              : `<li class="empty">Püramiidis pole veel mängijaid.</li>`;
            const a = $("#pyr-asof");
            if (a && seis) a.textContent = `seis ${seis}`;
          }
          if (pyrTop) pyrTop.textContent = jarjest[0] ? `Tipus ${jarjest[0].name}${seis ? ` · seis ${seis}` : ""}` : "Püramiidis pole veel mängijaid";
        }
        if (cur) olek("ok", `<i aria-hidden="true"></i><span>Edetabeli seis ${esc(asof || "—")} · andmed kontrollitud ${esc(cur.fetched_at ? fmtAeg(cur.fetched_at) : "—")}</span>`);
      } catch (e) {
        olek("error", `Edetabeliga ei saanud ühendust. Näitan viimast teadaolevat seisu (${esc(varuSeis)}).`);
      }
    })();
  }

  // ---------- E-posti aadressi kopeerimine (nupp ilmub ainult siis, kui lõikelaud on kasutatav) ----------
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    if (!navigator.clipboard || !window.isSecureContext) return;
    btn.hidden = false;
    const teade = btn.parentElement.querySelector(".copy-ok");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        teade.textContent = "Aadress kopeeritud";
      } catch (e) {
        // Lõikelaud keelatud: vali aadress ära, et selle saaks käsitsi kopeerida
        const r = document.createRange();
        r.selectNodeContents(btn.parentElement.querySelector("a"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        teade.textContent = "Aadress on valitud — kopeeri see käsitsi";
      }
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { teade.textContent = ""; }, 4000);
    });
  });

  // ---------- Google'i kaart alles nupuvajutusel (küpsised ainult nõusolekul) ----------
  const kaartNupp = $("#map-load");
  if (kaartNupp) {
    kaartNupp.addEventListener("click", () => {
      const box = $("#map");
      box.classList.add("on");
      box.innerHTML = '<iframe title="Viljandi Tennis – tennisehall, väliväljakud ja klubi kontor kaardil" ' +
        'src="https://www.google.com/maps/d/embed?mid=1edaLlcJRuS-RaN6xDFF_qVSuKz4"></iframe>';
      box.querySelector("iframe").focus();
    });
  }
})();
