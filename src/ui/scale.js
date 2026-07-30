/*
 * UI scale control, persisted in a cookie so it survives across visits.
 */
(function (root) {
  const { els } = root.WT.dom;

  const COOKIE_NAME = "uiScale";
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2;
  const STEP = 0.1;

  function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value};expires=${expires};path=/`;
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    const found = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  }

  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  function clampScale(scale) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  function apply(scale) {
    const clamped = clampScale(scale);
    document.documentElement.style.setProperty("--ui-scale", String(clamped));
    if (els.scaleValue) {
      els.scaleValue.textContent = `${Math.round(clamped * 100)}%`;
    }
    // Desktop relies on the --ui-scale custom property; mobile also needs a
    // transform because the layout is viewport driven there.
    if (els.appRoot) {
      els.appRoot.style.transform = isMobileDevice()
        ? `scale(${clamped})`
        : "";
    }
    return clamped;
  }

  function currentScale() {
    return (
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"),
      ) || 1
    );
  }

  function change(delta) {
    const next = Math.round((currentScale() + delta) * 100) / 100;
    const applied = apply(next);
    setCookie(COOKIE_NAME, applied);
  }

  function reset() {
    apply(1);
    setCookie(COOKIE_NAME, 1);
  }

  function init() {
    const stored = parseFloat(getCookie(COOKIE_NAME));
    apply(Number.isNaN(stored) ? 1 : stored);
    els.scaleMinusBtn?.addEventListener("click", () => change(-STEP));
    els.scalePlusBtn?.addEventListener("click", () => change(STEP));
    els.scaleResetBtn?.addEventListener("click", reset);
  }

  root.WT.scale = { init, apply, change, reset, clampScale, isMobileDevice };
})(typeof globalThis !== "undefined" ? globalThis : this);
