/*
 * Share links: copy the current config as a URL, import a pasted one.
 */
(function (root) {
  const { els } = root.WT.dom;
  const { shareLink } = root.WT;
  const { announce, showToast } = root.WT.feedback;

  /** Drop the query string from the address bar without reloading. */
  function clearQueryString() {
    if (!location.search) return false;
    try {
      const url = new URL(location.href);
      url.search = "";
      const origin = url.origin && url.origin !== "null" ? url.origin : "";
      history.replaceState(null, "", origin + url.pathname + url.hash);
      return true;
    } catch {
      try {
        history.replaceState(null, "", location.href.split("?")[0] + location.hash);
        return true;
      } catch {
        return false;
      }
    }
  }

  function setImportStatus(message, tone) {
    if (!els.importStatus) return;
    els.importStatus.style.display = message ? "block" : "none";
    els.importStatus.textContent = message;
    els.importStatus.className = `text-[10px] tracking-wide h-4 ${
      tone === "error" ? "text-rose-400" : "text-emerald-400"
    }`;
  }

  function create({ getCurrentConfig = () => null, onImport = () => false } = {}) {
    function currentUrl() {
      const cfg = getCurrentConfig();
      return shareLink.buildShareUrl({
        origin: location.origin,
        pathname: location.pathname,
        query: cfg ? shareLink.serialize(cfg) : "",
      });
    }

    async function copyUrl(message) {
      const url = currentUrl();
      try {
        await navigator.clipboard.writeText(url);
        announce(message);
        showToast("URL copied!");
      } catch (error) {
        console.warn("Clipboard copy failed", error);
        window.prompt("Copy URL", url);
      }
    }

    function importFromInput() {
      const query = shareLink.extractQueryString(els.importUrlInput?.value);
      if (!query) return;
      const cfg = shareLink.parse(query);
      if (!cfg || !onImport(cfg)) {
        announce("Invalid or unsupported parameters");
        setImportStatus("Invalid parameters", "error");
        return;
      }
      announce("Configuration loaded from URL");
      setImportStatus("Loaded ✅", "ok");
      clearQueryString();
    }

    /** Apply ?type=...&... from the current address, if present. */
    function applyLocationQuery() {
      const cfg = shareLink.parse(new URLSearchParams(location.search));
      if (!cfg || !onImport(cfg)) return false;
      clearQueryString();
      return true;
    }

    function init() {
      els.copyLinkBtn?.addEventListener("click", () =>
        copyUrl("Shareable URL copied"),
      );
      els.timerCopyBtn?.addEventListener("click", () =>
        copyUrl("Timer URL copied"),
      );
      els.importUrlBtn?.addEventListener("click", importFromInput);
      els.importUrlInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          importFromInput();
        }
      });
    }

    return { init, copyUrl, currentUrl, importFromInput, applyLocationQuery };
  }

  root.WT.shareView = { create, clearQueryString };
})(typeof globalThis !== "undefined" ? globalThis : this);
