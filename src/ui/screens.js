/*
 * Screen switching between Select / Config / Timer.
 */
(function (root) {
  const { els } = root.WT.dom;
  const { announce } = root.WT.feedback;

  const SCREEN_IDS = ["screenSelect", "screenConfig", "screenTimer"];
  let current = null;

  function show(id, { scrollTop = false, smooth = true } = {}) {
    SCREEN_IDS.forEach((screenId) => {
      const el = els[screenId];
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("active");
    });
    const target = els[id];
    if (target) {
      target.classList.remove("hidden");
      target.classList.add("active");
    }
    current = id;
    announce(`${id.replace("screen", "")} screen`);
    if (scrollTop) {
      window.scrollTo(smooth ? { top: 0, behavior: "smooth" } : { top: 0 });
    }
  }

  root.WT.screens = { SCREEN_IDS, show, currentId: () => current };
})(typeof globalThis !== "undefined" ? globalThis : this);
