// Fellin Rackets — ühine skript kõigile lehtedele.
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
  // Avaploki tervitus: ausalt kellaaja järgi — öösel ei ütle leht „avatud“.
  const tervitus = $("#k-olek");
  if (tervitus) {
    const pill = $("#k-live");
    if (tund < 6) { tervitus.textContent = "Sisehall puhkab — avame kell 6."; if (pill) pill.classList.add("off"); }
    else if (tund < 10) tervitus.textContent = "Tere hommikust! Sisehall on avatud.";
    else if (tund < 18) tervitus.textContent = "Tere päevast! Sisehall on avatud.";
    else tervitus.textContent = "Tere õhtust! Sisehall on avatud kuni 24.";
  }
  const hooaeg = $("#out-season");
  if (hooaeg) {
    const valjas = kuu >= 5 && kuu <= 10;
    hooaeg.textContent = valjas ? "hooaeg käib (mai–oktoober)" : "praegu suletud, hooaeg mai–oktoober";
    hooaeg.classList.toggle("off", !valjas);
  }

  // ---------- Mobiilimenüü (avatav loend, mitte ARIA menüü) ----------
  const nupp = $("#menu-btn"), menuu = $("#mobile-menu");
  if (nupp && menuu) {
    const sea = (lahti, fookus) => {
      menuu.hidden = !lahti;
      nupp.setAttribute("aria-expanded", String(lahti));
      if (!lahti && fookus) nupp.focus();
    };
    nupp.addEventListener("click", () => sea(menuu.hidden));
    menuu.addEventListener("click", (e) => { if (e.target.closest("a")) sea(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menuu.hidden) sea(false, true); });
    document.addEventListener("click", (e) => { if (!menuu.hidden && !e.target.closest(".top")) sea(false); });
    matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) sea(false); });
  }

  // ---------- VÜS edetabel ja püramiid: värske seis peale, värskus ausalt näha ----------
  const vusList = $("#vus-list"), pyrList = $("#pyr-list"), pyrTop = $("#pyr-top"), olekEl = $("#data-status");
  function delta(d) {
    if (d > 0) return `<span class="dl up"><span aria-hidden="true">▲</span>${d}<span class="vh"> kohta üles</span></span>`;
    if (d < 0) return `<span class="dl down"><span aria-hidden="true">▼</span>${-d}<span class="vh"> kohta alla</span></span>`;
    return `<span class="dl eq"><span aria-hidden="true">—</span><span class="vh">muutuseta</span></span>`;
  }
  function trend(d) {
    if (d > 0) return `<span class="k-trend up"><span aria-hidden="true">▲</span>${d}<span class="vh"> kohta üles</span></span>`;
    if (d < 0) return `<span class="k-trend down"><span aria-hidden="true">▼</span>${-d}<span class="vh"> kohta alla</span></span>`;
    return `<span class="k-trend eq"><span aria-hidden="true">—</span><span class="vh">muutuseta</span></span>`;
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
          const tabloo = vusList.dataset.stiil === "tabloo";
          vusList.innerHTML = top.length ? top.map((p, i) => tabloo
            ? `<li class="k-row"><span class="k-pos" aria-hidden="true">${i + 1}</span><span class="k-name">${esc(p.name)}` +
              `${i === 0 ? ' <span class="k-lead">liider</span>' : ""}</span><span class="k-pts num">${p.total}<small>p</small></span>${trend(p.rank_delta || 0)}</li>`
            : `<li><span class="rk num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span>${esc(p.name)}</span>` +
              `<span class="pts num">${p.total} p</span>${delta(p.rank_delta || 0)}</li>`).join("")
            : `<li><span class="empty">Tulemusi veel pole.</span></li>`;
          const a = $("#vus-asof");
          if (a) a.textContent = asof ? `seis ${asof}` : "seis";
        }
        if (pyr) {
          const jarjest = pyr.players.slice().sort((x, y) => x.pos - y.pos);
          const seis = pyr.updated_at ? fmtKuupaev(pyr.updated_at) : "";
          if (pyrList) {
            const n = Number(pyrList.dataset.n) || 5;
            pyrList.innerHTML = jarjest.length ? jarjest.slice(0, n).map((p, i) =>
              `<li class="pyr"><span class="rk num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>` +
              `<span>${esc(p.name)}${i === 0 ? ' <span aria-hidden="true">👑</span><span class="vh">(püramiidi tipp)</span>' : ""}</span></li>`).join("")
              : `<li><span class="empty">Püramiidis pole veel mängijaid.</span></li>`;
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
