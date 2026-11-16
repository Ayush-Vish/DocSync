// Shared viewport rules for hosted and offline page rendering.
export const fittedSlideCss = `
html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important}
body{display:flex!important;align-items:stretch!important;justify-content:stretch!important}
#artifact{width:100%!important;height:100%!important;display:flex!important;flex:1!important}
body>.slide,#artifact>.slide,.slide{width:100%!important;height:100%!important;min-height:0!important;max-width:none!important;margin:0!important;border:none!important;border-radius:0!important;aspect-ratio:auto!important;box-shadow:none!important;overflow:hidden!important}
body>nav[aria-label="Preview controls"],body>nav[aria-label="Presentation controls"],#ds-progress,#ds-float-bar,#ds-grid-overlay,.speaker-notes{display:none!important}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

export const documentPageCss = `
html,body,*{scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important}
body>nav[aria-label="Preview controls"],body>nav[aria-label="Presentation controls"],#ds-progress,#ds-float-bar,#ds-grid-overlay{display:none!important}
body:has(>.page),body:has(>#artifact>.page){padding:0!important;background:white!important}
body>.page,#artifact>.page{margin:0!important;width:100%!important;min-width:0!important;max-width:none!important;min-height:1056px;box-shadow:none!important}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;
