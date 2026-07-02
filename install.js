// PWA install nupp — ilmub ainult siis, kui brauser lubab paigaldust
// (Android: Chrome, Edge, Samsung Internet). Uks puudutus -> native prompt.
// iOS Safaris beforeinstallprompt puudub — seal kuvame lühijuhise.

(function () {
  let deferredPrompt = null;
  const DISMISS_KEY = "pwa_install_dismissed";

  function createButton() {
    const btn = document.createElement("button");
    btn.id = "install-btn";
    btn.className = "install-btn";
    btn.type = "button";
    btn.innerHTML = '<span aria-hidden="true">📲</span> Lisa telefoni avakuvale';

    const close = document.createElement("button");
    close.className = "install-btn-close";
    close.type = "button";
    close.setAttribute("aria-label", "Sulge");
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem(DISMISS_KEY, "1");
      wrap.remove();
    });

    const wrap = document.createElement("div");
    wrap.className = "install-wrap";
    wrap.appendChild(btn);
    wrap.appendChild(close);

    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      wrap.remove();
      if (choice && choice.outcome === "accepted") {
        localStorage.setItem(DISMISS_KEY, "1");
      }
    });

    document.body.appendChild(wrap);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (localStorage.getItem(DISMISS_KEY)) return;
    // Juba paigaldatud standalone-režiimis ei paku uuesti.
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    deferredPrompt = e;
    if (!document.getElementById("install-btn")) createButton();
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(DISMISS_KEY, "1");
    document.querySelector(".install-wrap")?.remove();
  });
})();
