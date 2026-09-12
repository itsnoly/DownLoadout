/**
 * DownLoadout - Vector Icon Sprite Registry
 * Injected directly into DOM to eliminate file:// fetch CORS errors in WebViews.
 */
(function () {
  const SPRITE_DATA = `
<svg width="0" height="0" style="position:absolute;display:none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#39c5bb"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>

    <symbol id="ic-folder" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></symbol>
    <symbol id="ic-refresh" viewBox="0 0 24 24"><path d="M20 11A8 8 0 1 0 18.5 15.5"/><path d="M20 5v6h-6"/></symbol>
    <symbol id="ic-wand" viewBox="0 0 24 24"><path d="M15 4l1.2 2.8L19 8l-2.8 1.2L15 12l-1.2-2.8L11 8l2.8-1.2L15 4z"/><path d="M5 14l6 6"/><path d="M9 20l1.5-1.5"/><path d="M3 22l4-4"/></symbol>
    <symbol id="ic-trash" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></symbol>
    <symbol id="ic-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="ic-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
    <symbol id="ic-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></symbol>
    <symbol id="ic-alert" viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></symbol>
    <symbol id="ic-dots" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></symbol>
    <symbol id="ic-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-6 6"/></symbol>
    <symbol id="ic-doc" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/></symbol>
    <symbol id="ic-video" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></symbol>
    <symbol id="ic-music" viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></symbol>
    <symbol id="ic-archive" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></symbol>
    <symbol id="ic-box" viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></symbol>
    <symbol id="ic-file" viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/></symbol>
    <symbol id="ic-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></symbol>
    <symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></symbol>
    <symbol id="ic-code" viewBox="0 0 24 24"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></symbol>
    <symbol id="ic-sheet" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></symbol>
    <symbol id="ic-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
    <symbol id="ic-chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
    <symbol id="ic-terminal" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></symbol>
    <symbol id="ic-expand" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></symbol>
    <symbol id="ic-collapse" viewBox="0 0 24 24"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 14l7-7"/><path d="M10 10L3 17"/></symbol>
  </defs>
</svg>
`;

  function init() {
    const holder = document.createElement("div");
    holder.style.display = "none";
    holder.innerHTML = SPRITE_DATA;
    document.body.insertBefore(holder, document.body.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();