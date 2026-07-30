/*
 * User feedback channels: screen-reader announcements, toasts, beeps, voice.
 */
(function (root) {
  const { els } = root.WT.dom;

  /** Announce on the ARIA live region (cleared first so SRs re-read it). */
  function announce(message) {
    const region = els.liveRegion;
    if (!region) return;
    region.textContent = "";
    setTimeout(() => {
      region.textContent = message;
    }, 40);
  }

  function showToast(message, duration = 2000) {
    const toast = els.toast;
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("opacity-0");
    toast.classList.add("opacity-100");
    clearTimeout(showToast._handle);
    showToast._handle = setTimeout(() => {
      toast.classList.remove("opacity-100");
      toast.classList.add("opacity-0");
    }, duration);
  }

  class Beeper {
    constructor() {
      this.ctx = null;
    }
    _ensure() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this.ctx = new Ctx();
      }
      return this.ctx;
    }
    beep({ freq = 660, duration = 0.12, type = "sine", volume = 0.3 } = {}) {
      const ctx = this._ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    }
    /** Two-tone cue used when an interval starts. */
    sequence() {
      this.beep({ freq: 660 });
      setTimeout(() => this.beep({ freq: 880 }), 120);
    }
  }

  const beeper = new Beeper();

  const isSoundEnabled = () => Boolean(els.soundToggle?.checked);
  const isVoiceEnabled = () => Boolean(els.voiceToggle?.checked);

  function beep(options) {
    if (isSoundEnabled()) beeper.beep(options);
  }

  function beepSequence() {
    if (isSoundEnabled()) beeper.sequence();
  }

  function speak(text) {
    if (!isVoiceEnabled()) return;
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  root.WT.feedback = {
    announce,
    showToast,
    Beeper,
    beeper,
    beep,
    beepSequence,
    speak,
    isSoundEnabled,
    isVoiceEnabled,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
