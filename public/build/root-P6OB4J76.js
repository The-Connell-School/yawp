import {
  useDebounce
} from "/build/_shared/chunk-ATAELGAQ.js";
import {
  useTheme
} from "/build/_shared/chunk-VOZB6DJP.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  HoneypotProvider
} from "/build/_shared/chunk-6NMOG26R.js";
import {
  AuthenticityTokenProvider
} from "/build/_shared/chunk-6LMWWETO.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import {
  withSentry
} from "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import "/build/_shared/chunk-3FJOVXYZ.js";
import "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useNavigation,
  useRevalidator
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import {
  require_react_dom
} from "/build/_shared/chunk-GIAAE3CH.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:./utils/auth.server.ts
var require_auth_server = __commonJS({
  "empty-module:./utils/auth.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/csrf.server.ts
var require_csrf_server = __commonJS({
  "empty-module:./utils/csrf.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/db.server.ts
var require_db_server = __commonJS({
  "empty-module:./utils/db.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/env.server.ts
var require_env_server = __commonJS({
  "empty-module:./utils/env.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/honeypot.server.ts
var require_honeypot_server = __commonJS({
  "empty-module:./utils/honeypot.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/state/nav-state.server.ts
var require_nav_state_server = __commonJS({
  "empty-module:./utils/state/nav-state.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/state/theme.server.ts
var require_theme_server = __commonJS({
  "empty-module:./utils/state/theme.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/timing.server.ts
var require_timing_server = __commonJS({
  "empty-module:./utils/timing.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:./utils/toast.server.ts
var require_toast_server = __commonJS({
  "empty-module:./utils/toast.server.ts"(exports, module) {
    module.exports = {};
  }
});

// css-bundle-plugin-ns:@remix-run/css-bundle
var cssBundleHref = void 0;

// app/root.tsx
var import_node = __toESM(require_node(), 1);
var import_react8 = __toESM(require_react(), 1);

// app/components/global-loading.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/global-loading.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/global-loading.tsx"
  );
  import.meta.hot.lastModified = "1709245240094.097";
}
function GlobalLoading() {
  _s();
  const navigation = useNavigation();
  const [active] = useDebounce(navigation.state !== "idle", 200);
  const ref = React.useRef(null);
  const [animationComplete, setAnimationComplete] = React.useState(true);
  React.useEffect(() => {
    if (!ref.current)
      return;
    if (active)
      setAnimationComplete(false);
    Promise.allSettled(ref.current.getAnimations().map(({
      finished
    }) => finished)).then(() => !active && setAnimationComplete(true));
  }, [active]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { role: "progressbar", "aria-hidden": !active, "aria-valuetext": active ? "Loading" : void 0, className: "fixed inset-x-0 left-0 top-0 z-50 h-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { ref, className: cn("h-full bg-primary transition-all duration-500 ease-in-out", navigation.state === "idle" && animationComplete && "w-0 opacity-0 transition-none", navigation.state === "submitting" && "w-4/12", navigation.state === "loading" && "w-10/12", navigation.state === "idle" && !animationComplete && "w-full") }, void 0, false, {
    fileName: "app/components/global-loading.tsx",
    lineNumber: 40,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/components/global-loading.tsx",
    lineNumber: 39,
    columnNumber: 10
  }, this);
}
_s(GlobalLoading, "qBzWlzPqjrCs/Mm7hvrwFj+43Vg=", false, function() {
  return [useNavigation, useDebounce];
});
_c = GlobalLoading;
var _c;
$RefreshReg$(_c, "GlobalLoading");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/toaster.tsx
var import_react5 = __toESM(require_react(), 1);

// node_modules/sonner/dist/index.mjs
var import_react2 = __toESM(require_react(), 1);
var import_react_dom = __toESM(require_react_dom(), 1);
var import_react3 = __toESM(require_react(), 1);
var import_react4 = __toESM(require_react(), 1);
"use client";
function lt(c, { insertAt: a } = {}) {
  if (!c || typeof document == "undefined")
    return;
  let t = document.head || document.getElementsByTagName("head")[0], s = document.createElement("style");
  s.type = "text/css", a === "top" && t.firstChild ? t.insertBefore(s, t.firstChild) : t.appendChild(s), s.styleSheet ? s.styleSheet.cssText = c : s.appendChild(document.createTextNode(c));
}
lt(`html[dir=ltr],[data-sonner-toaster][dir=ltr]{--toast-icon-margin-start: -3px;--toast-icon-margin-end: 4px;--toast-svg-margin-start: -1px;--toast-svg-margin-end: 0px;--toast-button-margin-start: auto;--toast-button-margin-end: 0;--toast-close-button-start: 0;--toast-close-button-end: unset;--toast-close-button-transform: translate(-35%, -35%)}html[dir=rtl],[data-sonner-toaster][dir=rtl]{--toast-icon-margin-start: 4px;--toast-icon-margin-end: -3px;--toast-svg-margin-start: 0px;--toast-svg-margin-end: -1px;--toast-button-margin-start: 0;--toast-button-margin-end: auto;--toast-close-button-start: unset;--toast-close-button-end: 0;--toast-close-button-transform: translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1: hsl(0, 0%, 99%);--gray2: hsl(0, 0%, 97.3%);--gray3: hsl(0, 0%, 95.1%);--gray4: hsl(0, 0%, 93%);--gray5: hsl(0, 0%, 90.9%);--gray6: hsl(0, 0%, 88.7%);--gray7: hsl(0, 0%, 85.8%);--gray8: hsl(0, 0%, 78%);--gray9: hsl(0, 0%, 56.1%);--gray10: hsl(0, 0%, 52.3%);--gray11: hsl(0, 0%, 43.5%);--gray12: hsl(0, 0%, 9%);--border-radius: 8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:none;z-index:999999999}[data-sonner-toaster][data-x-position=right]{right:max(var(--offset),env(safe-area-inset-right))}[data-sonner-toaster][data-x-position=left]{left:max(var(--offset),env(safe-area-inset-left))}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translate(-50%)}[data-sonner-toaster][data-y-position=top]{top:max(var(--offset),env(safe-area-inset-top))}[data-sonner-toaster][data-y-position=bottom]{bottom:max(var(--offset),env(safe-area-inset-bottom))}[data-sonner-toast]{--y: translateY(100%);--lift-amount: calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;will-change:transform,opacity,height;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:none;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px #0000001a;width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px #0000001a,0 0 0 2px #0003}[data-sonner-toast][data-y-position=top]{top:0;--y: translateY(-100%);--lift: 1;--lift-amount: calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y: translateY(100%);--lift: -1;--lift-amount: calc(var(--lift) * var(--gap))}[data-sonner-toast] [data-description]{font-weight:400;line-height:1.4;color:inherit}[data-sonner-toast] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast] [data-icon]>*{flex-shrink:0}[data-sonner-toast] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;cursor:pointer;outline:none;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast] [data-button]:focus-visible{box-shadow:0 0 0 2px #0006}[data-sonner-toast] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toast][data-theme=dark] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;background:var(--gray1);color:var(--gray12);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast] [data-close-button]:focus-visible{box-shadow:0 4px 12px #0000001a,0 0 0 2px #0003}[data-sonner-toast] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]:before{content:"";position:absolute;left:0;right:0;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]:before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]:before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]:before{content:"";position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast]:after{content:"";position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y: translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale: var(--toasts-before) * .05 + 1;--y: translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y: translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y: translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y: translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y: translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]:before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount, 0px));transition:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation:swipe-out .2s ease-out forwards}@keyframes swipe-out{0%{transform:translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount)));opacity:1}to{transform:translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount) + var(--lift) * -100%));opacity:0}}@media (max-width: 600px){[data-sonner-toaster]{position:fixed;--mobile-offset: 16px;right:var(--mobile-offset);left:var(--mobile-offset);width:100%}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - 32px)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset)}[data-sonner-toaster][data-y-position=bottom]{bottom:20px}[data-sonner-toaster][data-y-position=top]{top:20px}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset);right:var(--mobile-offset);transform:none}}[data-sonner-toaster][data-theme=light]{--normal-bg: #fff;--normal-border: var(--gray4);--normal-text: var(--gray12);--success-bg: hsl(143, 85%, 96%);--success-border: hsl(145, 92%, 91%);--success-text: hsl(140, 100%, 27%);--info-bg: hsl(208, 100%, 97%);--info-border: hsl(221, 91%, 91%);--info-text: hsl(210, 92%, 45%);--warning-bg: hsl(49, 100%, 97%);--warning-border: hsl(49, 91%, 91%);--warning-text: hsl(31, 92%, 45%);--error-bg: hsl(359, 100%, 97%);--error-border: hsl(359, 100%, 94%);--error-text: hsl(360, 100%, 45%)}[data-sonner-toaster][data-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg: #000;--normal-border: hsl(0, 0%, 20%);--normal-text: var(--gray1)}[data-sonner-toaster][data-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg: #fff;--normal-border: var(--gray3);--normal-text: var(--gray12)}[data-sonner-toaster][data-theme=dark]{--normal-bg: #000;--normal-border: hsl(0, 0%, 20%);--normal-text: var(--gray1);--success-bg: hsl(150, 100%, 6%);--success-border: hsl(147, 100%, 12%);--success-text: hsl(150, 86%, 65%);--info-bg: hsl(215, 100%, 6%);--info-border: hsl(223, 100%, 12%);--info-text: hsl(216, 87%, 65%);--warning-bg: hsl(64, 100%, 6%);--warning-border: hsl(60, 100%, 12%);--warning-text: hsl(46, 87%, 65%);--error-bg: hsl(358, 76%, 10%);--error-border: hsl(357, 89%, 16%);--error-text: hsl(358, 100%, 81%)}[data-rich-colors=true] [data-sonner-toast][data-type=success],[data-rich-colors=true] [data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true] [data-sonner-toast][data-type=info],[data-rich-colors=true] [data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true] [data-sonner-toast][data-type=warning],[data-rich-colors=true] [data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true] [data-sonner-toast][data-type=error],[data-rich-colors=true] [data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size: 16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:nth-child(1){animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}to{opacity:.15}}@media (prefers-reduced-motion){[data-sonner-toast],[data-sonner-toast]>*,.sonner-loading-bar{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}
`);
var St = (c) => {
  switch (c) {
    case "success":
      return zt;
    case "info":
      return Yt;
    case "warning":
      return At;
    case "error":
      return jt;
    default:
      return null;
  }
};
var Lt = Array(12).fill(0);
var kt = ({ visible: c }) => import_react3.default.createElement("div", { className: "sonner-loading-wrapper", "data-visible": c }, import_react3.default.createElement("div", { className: "sonner-spinner" }, Lt.map((a, t) => import_react3.default.createElement("div", { className: "sonner-loading-bar", key: `spinner-bar-${t}` }))));
var zt = import_react3.default.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", height: "20", width: "20" }, import_react3.default.createElement("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z", clipRule: "evenodd" }));
var At = import_react3.default.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "currentColor", height: "20", width: "20" }, import_react3.default.createElement("path", { fillRule: "evenodd", d: "M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z", clipRule: "evenodd" }));
var Yt = import_react3.default.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", height: "20", width: "20" }, import_react3.default.createElement("path", { fillRule: "evenodd", d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z", clipRule: "evenodd" }));
var jt = import_react3.default.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 20 20", fill: "currentColor", height: "20", width: "20" }, import_react3.default.createElement("path", { fillRule: "evenodd", d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z", clipRule: "evenodd" }));
var Bt = () => {
  let [c, a] = import_react4.default.useState(false);
  return import_react4.default.useEffect(() => {
    let t = () => {
      a(document.hidden);
    };
    return document.addEventListener("visibilitychange", t), () => window.removeEventListener("visibilitychange", t);
  }, []), c;
};
var dt = 1;
var ct = class {
  constructor() {
    this.subscribe = (a) => (this.subscribers.push(a), () => {
      let t = this.subscribers.indexOf(a);
      this.subscribers.splice(t, 1);
    });
    this.publish = (a) => {
      this.subscribers.forEach((t) => t(a));
    };
    this.addToast = (a) => {
      this.publish(a), this.toasts = [...this.toasts, a];
    };
    this.create = (a) => {
      var m;
      let { message: t, ...s } = a, y = typeof (a == null ? void 0 : a.id) == "number" || ((m = a.id) == null ? void 0 : m.length) > 0 ? a.id : dt++, g = this.toasts.find((r) => r.id === y), f = a.dismissible === void 0 ? true : a.dismissible;
      return g ? this.toasts = this.toasts.map((r) => r.id === y ? (this.publish({ ...r, ...a, id: y, title: t }), { ...r, ...a, id: y, dismissible: f, title: t }) : r) : this.addToast({ title: t, ...s, dismissible: f, id: y }), y;
    };
    this.dismiss = (a) => (a || this.toasts.forEach((t) => {
      this.subscribers.forEach((s) => s({ id: t.id, dismiss: true }));
    }), this.subscribers.forEach((t) => t({ id: a, dismiss: true })), a);
    this.message = (a, t) => this.create({ ...t, message: a });
    this.error = (a, t) => this.create({ ...t, message: a, type: "error" });
    this.success = (a, t) => this.create({ ...t, type: "success", message: a });
    this.info = (a, t) => this.create({ ...t, type: "info", message: a });
    this.warning = (a, t) => this.create({ ...t, type: "warning", message: a });
    this.loading = (a, t) => this.create({ ...t, type: "loading", message: a });
    this.promise = (a, t) => {
      if (!t)
        return;
      let s;
      t.loading !== void 0 && (s = this.create({ ...t, promise: a, type: "loading", message: t.loading, description: typeof t.description != "function" ? t.description : void 0 }));
      let y = a instanceof Promise ? a : a(), g = s !== void 0;
      return y.then((f) => {
        if (f && typeof f.ok == "boolean" && !f.ok) {
          g = false;
          let m = typeof t.error == "function" ? t.error(`HTTP error! status: ${f.status}`) : t.error, r = typeof t.description == "function" ? t.description(`HTTP error! status: ${f.status}`) : t.description;
          this.create({ id: s, type: "error", message: m, description: r });
        } else if (t.success !== void 0) {
          g = false;
          let m = typeof t.success == "function" ? t.success(f) : t.success, r = typeof t.description == "function" ? t.description(f) : t.description;
          this.create({ id: s, type: "success", message: m, description: r });
        }
      }).catch((f) => {
        if (t.error !== void 0) {
          g = false;
          let m = typeof t.error == "function" ? t.error(f) : t.error, r = typeof t.description == "function" ? t.description(f) : t.description;
          this.create({ id: s, type: "error", message: m, description: r });
        }
      }).finally(() => {
        var f;
        g && (this.dismiss(s), s = void 0), (f = t.finally) == null || f.call(t);
      }), s;
    };
    this.custom = (a, t) => {
      let s = (t == null ? void 0 : t.id) || dt++;
      return this.create({ jsx: a(s), id: s, ...t }), s;
    };
    this.subscribers = [], this.toasts = [];
  }
};
var T = new ct();
var Ft = (c, a) => {
  let t = (a == null ? void 0 : a.id) || dt++;
  return T.addToast({ title: c, ...a, id: t }), t;
};
var $t = Ft;
var Ut = Object.assign($t, { success: T.success, info: T.info, warning: T.warning, error: T.error, custom: T.custom, message: T.message, promise: T.promise, dismiss: T.dismiss, loading: T.loading });
var _t = 3;
var Vt = "32px";
var Kt = 4e3;
var Xt = 356;
var Nt = 14;
var Jt = 20;
var Gt = 200;
function j(...c) {
  return c.filter(Boolean).join(" ");
}
var qt = (c) => {
  var ht, bt, yt, vt, xt, Tt, wt;
  let { invert: a, toast: t, unstyled: s, interacting: y, setHeights: g, visibleToasts: f, heights: m, index: r, toasts: Z, expanded: F, removeToast: _, closeButton: V, style: n, cancelButtonStyle: K, actionButtonStyle: tt, className: et = "", descriptionClassName: at = "", duration: X, position: B, gap: $ = Nt, loadingIcon: J, expandByDefault: z, classNames: l, closeButtonAriaLabel: ot = "Close toast", pauseWhenPageIsHidden: M } = c, [H, G] = import_react2.default.useState(false), [q, R] = import_react2.default.useState(false), [P, O] = import_react2.default.useState(false), [S, L] = import_react2.default.useState(false), [st, i] = import_react2.default.useState(0), [p, h] = import_react2.default.useState(0), N = import_react2.default.useRef(null), x = import_react2.default.useRef(null), u = r === 0, U = r + 1 <= f, v = t.type, D = t.dismissible !== false, W = t.className || "", Dt = t.descriptionClassName || "", Q = import_react2.default.useMemo(() => m.findIndex((o) => o.toastId === t.id) || 0, [m, t.id]), Pt = import_react2.default.useMemo(() => {
    var o;
    return (o = t.closeButton) != null ? o : V;
  }, [t.closeButton, V]), ut = import_react2.default.useMemo(() => t.duration || X || Kt, [t.duration, X]), nt = import_react2.default.useRef(0), A = import_react2.default.useRef(0), ft = import_react2.default.useRef(0), Y = import_react2.default.useRef(null), [mt, Ct] = B.split("-"), pt = import_react2.default.useMemo(() => m.reduce((o, d, b) => b >= Q ? o : o + d.height, 0), [m, Q]), gt = Bt(), Ht = t.invert || a, rt = v === "loading";
  A.current = import_react2.default.useMemo(() => Q * $ + pt, [Q, pt]), import_react2.default.useEffect(() => {
    G(true);
  }, []), import_react2.default.useLayoutEffect(() => {
    if (!H)
      return;
    let o = x.current, d = o.style.height;
    o.style.height = "auto";
    let b = o.getBoundingClientRect().height;
    o.style.height = d, h(b), g((k) => k.find((w) => w.toastId === t.id) ? k.map((w) => w.toastId === t.id ? { ...w, height: b } : w) : [{ toastId: t.id, height: b, position: t.position }, ...k]);
  }, [H, t.title, t.description, g, t.id]);
  let C = import_react2.default.useCallback(() => {
    R(true), i(A.current), g((o) => o.filter((d) => d.toastId !== t.id)), setTimeout(() => {
      _(t);
    }, Gt);
  }, [t, _, g, A]);
  import_react2.default.useEffect(() => {
    if (t.promise && v === "loading" || t.duration === 1 / 0 || t.type === "loading")
      return;
    let o, d = ut;
    return F || y || M && gt ? (() => {
      if (ft.current < nt.current) {
        let I = (/* @__PURE__ */ new Date()).getTime() - nt.current;
        d = d - I;
      }
      ft.current = (/* @__PURE__ */ new Date()).getTime();
    })() : (() => {
      nt.current = (/* @__PURE__ */ new Date()).getTime(), o = setTimeout(() => {
        var I;
        (I = t.onAutoClose) == null || I.call(t, t), C();
      }, d);
    })(), () => clearTimeout(o);
  }, [F, y, z, t, ut, C, t.promise, v, M, gt]), import_react2.default.useEffect(() => {
    let o = x.current;
    if (o) {
      let d = o.getBoundingClientRect().height;
      return h(d), g((b) => [{ toastId: t.id, height: d, position: t.position }, ...b]), () => g((b) => b.filter((k) => k.toastId !== t.id));
    }
  }, [g, t.id]), import_react2.default.useEffect(() => {
    t.delete && C();
  }, [C, t.delete]);
  function Rt() {
    return J ? import_react2.default.createElement("div", { className: "sonner-loader", "data-visible": v === "loading" }, J) : import_react2.default.createElement(kt, { visible: v === "loading" });
  }
  return import_react2.default.createElement("li", { "aria-live": t.important ? "assertive" : "polite", "aria-atomic": "true", role: "status", tabIndex: 0, ref: x, className: j(et, W, l == null ? void 0 : l.toast, (ht = t == null ? void 0 : t.classNames) == null ? void 0 : ht.toast, l == null ? void 0 : l[v], (bt = t == null ? void 0 : t.classNames) == null ? void 0 : bt[v]), "data-sonner-toast": "", "data-styled": !(t.jsx || t.unstyled || s), "data-mounted": H, "data-promise": !!t.promise, "data-removed": q, "data-visible": U, "data-y-position": mt, "data-x-position": Ct, "data-index": r, "data-front": u, "data-swiping": P, "data-dismissible": D, "data-type": v, "data-invert": Ht, "data-swipe-out": S, "data-expanded": !!(F || z && H), style: { "--index": r, "--toasts-before": r, "--z-index": Z.length - r, "--offset": `${q ? st : A.current}px`, "--initial-height": z ? "auto" : `${p}px`, ...n, ...t.style }, onPointerDown: (o) => {
    rt || !D || (N.current = /* @__PURE__ */ new Date(), i(A.current), o.target.setPointerCapture(o.pointerId), o.target.tagName !== "BUTTON" && (O(true), Y.current = { x: o.clientX, y: o.clientY }));
  }, onPointerUp: () => {
    var k, I, w, it;
    if (S || !D)
      return;
    Y.current = null;
    let o = Number(((k = x.current) == null ? void 0 : k.style.getPropertyValue("--swipe-amount").replace("px", "")) || 0), d = (/* @__PURE__ */ new Date()).getTime() - ((I = N.current) == null ? void 0 : I.getTime()), b = Math.abs(o) / d;
    if (Math.abs(o) >= Jt || b > 0.11) {
      i(A.current), (w = t.onDismiss) == null || w.call(t, t), C(), L(true);
      return;
    }
    (it = x.current) == null || it.style.setProperty("--swipe-amount", "0px"), O(false);
  }, onPointerMove: (o) => {
    var Et;
    if (!Y.current || !D)
      return;
    let d = o.clientY - Y.current.y, b = o.clientX - Y.current.x, I = (mt === "top" ? Math.min : Math.max)(0, d), w = o.pointerType === "touch" ? 10 : 2;
    Math.abs(I) > w ? (Et = x.current) == null || Et.style.setProperty("--swipe-amount", `${d}px`) : Math.abs(b) > w && (Y.current = null);
  } }, Pt && !t.jsx ? import_react2.default.createElement("button", { "aria-label": ot, "data-disabled": rt, "data-close-button": true, onClick: rt || !D ? () => {
  } : () => {
    var o;
    C(), (o = t.onDismiss) == null || o.call(t, t);
  }, className: j(l == null ? void 0 : l.closeButton, (yt = t == null ? void 0 : t.classNames) == null ? void 0 : yt.closeButton) }, import_react2.default.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }, import_react2.default.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), import_react2.default.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }))) : null, t.jsx || import_react2.default.isValidElement(t.title) ? t.jsx || t.title : import_react2.default.createElement(import_react2.default.Fragment, null, v || t.icon || t.promise ? import_react2.default.createElement("div", { "data-icon": "" }, (t.promise || t.type === "loading") && !t.icon ? Rt() : null, t.icon || St(v)) : null, import_react2.default.createElement("div", { "data-content": "" }, import_react2.default.createElement("div", { "data-title": "", className: j(l == null ? void 0 : l.title, (vt = t == null ? void 0 : t.classNames) == null ? void 0 : vt.title) }, t.title), t.description ? import_react2.default.createElement("div", { "data-description": "", className: j(at, Dt, l == null ? void 0 : l.description, (xt = t == null ? void 0 : t.classNames) == null ? void 0 : xt.description) }, t.description) : null), t.cancel ? import_react2.default.createElement("button", { "data-button": true, "data-cancel": true, style: t.cancelButtonStyle || K, onClick: (o) => {
    var d;
    D && (C(), (d = t.cancel) != null && d.onClick && t.cancel.onClick(o));
  }, className: j(l == null ? void 0 : l.cancelButton, (Tt = t == null ? void 0 : t.classNames) == null ? void 0 : Tt.cancelButton) }, t.cancel.label) : null, t.action ? import_react2.default.createElement("button", { "data-button": "", style: t.actionButtonStyle || tt, onClick: (o) => {
    var d;
    (d = t.action) == null || d.onClick(o), !o.defaultPrevented && C();
  }, className: j(l == null ? void 0 : l.actionButton, (wt = t == null ? void 0 : t.classNames) == null ? void 0 : wt.actionButton) }, t.action.label) : null));
};
function Mt() {
  if (typeof window == "undefined" || typeof document == "undefined")
    return "ltr";
  let c = document.documentElement.getAttribute("dir");
  return c === "auto" || !c ? window.getComputedStyle(document.documentElement).direction : c;
}
var ce = (c) => {
  let { invert: a, position: t = "bottom-right", hotkey: s = ["altKey", "KeyT"], expand: y, closeButton: g, className: f, offset: m, theme: r = "light", richColors: Z, duration: F, style: _, visibleToasts: V = _t, toastOptions: n, dir: K = Mt(), gap: tt, loadingIcon: et, containerAriaLabel: at = "Notifications", pauseWhenPageIsHidden: X } = c, [B, $] = import_react2.default.useState([]), J = import_react2.default.useMemo(() => Array.from(new Set([t].concat(B.filter((i) => i.position).map((i) => i.position)))), [B, t]), [z, l] = import_react2.default.useState([]), [ot, M] = import_react2.default.useState(false), [H, G] = import_react2.default.useState(false), [q, R] = import_react2.default.useState(r !== "system" ? r : typeof window != "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), P = import_react2.default.useRef(null), O = s.join("+").replace(/Key/g, "").replace(/Digit/g, ""), S = import_react2.default.useRef(null), L = import_react2.default.useRef(false), st = import_react2.default.useCallback((i) => $((p) => p.filter(({ id: h }) => h !== i.id)), []);
  return import_react2.default.useEffect(() => T.subscribe((i) => {
    if (i.dismiss) {
      $((p) => p.map((h) => h.id === i.id ? { ...h, delete: true } : h));
      return;
    }
    setTimeout(() => {
      import_react_dom.default.flushSync(() => {
        $((p) => {
          let h = p.findIndex((N) => N.id === i.id);
          return h !== -1 ? [...p.slice(0, h), { ...p[h], ...i }, ...p.slice(h + 1)] : [i, ...p];
        });
      });
    });
  }), []), import_react2.default.useEffect(() => {
    if (r !== "system") {
      R(r);
      return;
    }
    r === "system" && (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? R("dark") : R("light")), typeof window != "undefined" && window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ({ matches: i }) => {
      R(i ? "dark" : "light");
    });
  }, [r]), import_react2.default.useEffect(() => {
    B.length <= 1 && M(false);
  }, [B]), import_react2.default.useEffect(() => {
    let i = (p) => {
      var N, x;
      s.every((u) => p[u] || p.code === u) && (M(true), (N = P.current) == null || N.focus()), p.code === "Escape" && (document.activeElement === P.current || (x = P.current) != null && x.contains(document.activeElement)) && M(false);
    };
    return document.addEventListener("keydown", i), () => document.removeEventListener("keydown", i);
  }, [s]), import_react2.default.useEffect(() => {
    if (P.current)
      return () => {
        S.current && (S.current.focus({ preventScroll: true }), S.current = null, L.current = false);
      };
  }, [P.current]), B.length ? import_react2.default.createElement("section", { "aria-label": `${at} ${O}`, tabIndex: -1 }, J.map((i, p) => {
    var x;
    let [h, N] = i.split("-");
    return import_react2.default.createElement("ol", { key: i, dir: K === "auto" ? Mt() : K, tabIndex: -1, ref: P, className: f, "data-sonner-toaster": true, "data-theme": q, "data-rich-colors": Z, "data-y-position": h, "data-x-position": N, style: { "--front-toast-height": `${(x = z[0]) == null ? void 0 : x.height}px`, "--offset": typeof m == "number" ? `${m}px` : m || Vt, "--width": `${Xt}px`, "--gap": `${Nt}px`, ..._ }, onBlur: (u) => {
      L.current && !u.currentTarget.contains(u.relatedTarget) && (L.current = false, S.current && (S.current.focus({ preventScroll: true }), S.current = null));
    }, onFocus: (u) => {
      u.target instanceof HTMLElement && u.target.dataset.dismissible === "false" || L.current || (L.current = true, S.current = u.relatedTarget);
    }, onMouseEnter: () => M(true), onMouseMove: () => M(true), onMouseLeave: () => {
      H || M(false);
    }, onPointerDown: (u) => {
      u.target instanceof HTMLElement && u.target.dataset.dismissible === "false" || G(true);
    }, onPointerUp: () => G(false) }, B.filter((u) => !u.position && p === 0 || u.position === i).map((u, U) => {
      var v, D;
      return import_react2.default.createElement(qt, { key: u.id, index: U, toast: u, duration: (v = n == null ? void 0 : n.duration) != null ? v : F, className: n == null ? void 0 : n.className, descriptionClassName: n == null ? void 0 : n.descriptionClassName, invert: a, visibleToasts: V, closeButton: (D = n == null ? void 0 : n.closeButton) != null ? D : g, interacting: H, position: i, style: n == null ? void 0 : n.style, unstyled: n == null ? void 0 : n.unstyled, classNames: n == null ? void 0 : n.classNames, cancelButtonStyle: n == null ? void 0 : n.cancelButtonStyle, actionButtonStyle: n == null ? void 0 : n.actionButtonStyle, removeToast: st, toasts: B.filter((W) => W.position == u.position), heights: z.filter((W) => W.position == u.position), setHeights: l, expandByDefault: y, gap: tt, loadingIcon: et, expanded: ot, pauseWhenPageIsHidden: X });
    }));
  })) : null;
};

// app/components/toaster.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/toaster.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
var _s22 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/toaster.tsx"
  );
  import.meta.hot.lastModified = "1709226708741.0715";
}
function Toaster({
  toast
}) {
  _s2();
  const theme = useTheme();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_jsx_dev_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ce, { closeButton: true, position: "bottom-right", theme }, void 0, false, {
      fileName: "app/components/toaster.tsx",
      lineNumber: 32,
      columnNumber: 4
    }, this),
    toast ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ShowToast, { toast }, void 0, false, {
      fileName: "app/components/toaster.tsx",
      lineNumber: 33,
      columnNumber: 13
    }, this) : null
  ] }, void 0, true, {
    fileName: "app/components/toaster.tsx",
    lineNumber: 31,
    columnNumber: 10
  }, this);
}
_s2(Toaster, "VrMvFCCB9Haniz3VCRPNUiCauHs=", false, function() {
  return [useTheme];
});
_c2 = Toaster;
function ShowToast({
  toast
}) {
  _s22();
  const {
    id,
    type,
    title,
    description,
    closeButton
  } = toast;
  (0, import_react5.useEffect)(() => {
    setTimeout(() => {
      Ut[type](title, {
        id,
        description,
        closeButton
      });
    }, 0);
  }, [description, id, title, type, closeButton]);
  return null;
}
_s22(ShowToast, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c22 = ShowToast;
var _c2;
var _c22;
$RefreshReg$(_c2, "Toaster");
$RefreshReg$(_c22, "ShowToast");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/contexts/nonce.ts
var React2 = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/contexts/nonce.ts"
  );
  import.meta.hot.lastModified = "1704908489730.7559";
}
var NonceContext = React2.createContext("");
var NonceProvider = NonceContext.Provider;
var useNonce = () => React2.useContext(NonceContext);

// app/styles/tailwind.css
var tailwind_default = "/build/_assets/tailwind-Y6FEZW3K.css";

// app/root.tsx
var import_auth_server = __toESM(require_auth_server(), 1);

// node_modules/@epic-web/client-hints/dist/index.js
function getHintUtils(hints) {
  function getCookieValue(cookieString, name) {
    const hint = hints[name];
    if (!hint) {
      throw new Error(`Unknown client hint: ${typeof name === "string" ? name : "Unknown"}`);
    }
    const value = cookieString.split(";").map((c) => c.trim()).find((c) => c.startsWith(hint.cookieName + "="))?.split("=")[1];
    return value ? decodeURIComponent(value) : null;
  }
  function getHints2(request) {
    const cookieString = typeof document !== "undefined" ? document.cookie : typeof request !== "undefined" ? request.headers.get("Cookie") ?? "" : "";
    return Object.entries(hints).reduce((acc, [name, hint]) => {
      const hintName = name;
      if ("transform" in hint) {
        acc[hintName] = hint.transform(getCookieValue(cookieString, hintName) ?? hint.fallback);
      } else {
        acc[hintName] = getCookieValue(cookieString, hintName) ?? hint.fallback;
      }
      return acc;
    }, {});
  }
  function getClientHintCheckScript() {
    return `
const cookies = document.cookie.split(';').map(c => c.trim()).reduce((acc, cur) => {
	const [key, value] = cur.split('=');
	acc[key] = value;
	return acc;
}, {});
let cookieChanged = false;
const hints = [
${Object.values(hints).map((hint) => {
      const cookieName = JSON.stringify(hint.cookieName);
      return `{ name: ${cookieName}, actual: String(${hint.getValueCode}), value: cookies[${cookieName}] ?? encodeURIComponent("${hint.fallback}") }`;
    }).join(",\n")}
];
for (const hint of hints) {
	document.cookie = encodeURIComponent(hint.name) + '=' + encodeURIComponent(hint.actual) + '; Max-Age=31536000; path=/';
	if (decodeURIComponent(hint.value) !== hint.actual) {
		cookieChanged = true;
	}
}
// if the cookie changed, reload the page, unless the browser doesn't support
// cookies (in which case we would enter an infinite loop of reloads)
if (cookieChanged && navigator.cookieEnabled) {
	window.location.reload();
}
			`;
  }
  return { getHints: getHints2, getClientHintCheckScript };
}

// node_modules/@epic-web/client-hints/dist/color-scheme.js
var clientHint = {
  cookieName: "CH-prefers-color-scheme",
  getValueCode: `window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`,
  fallback: "light",
  transform(value) {
    return value === "dark" ? "dark" : "light";
  }
};
function subscribeToSchemeChange(subscriber, cookieName = clientHint.cookieName) {
  const schemaMatch = window.matchMedia("(prefers-color-scheme: dark)");
  function handleThemeChange() {
    const value = schemaMatch.matches ? "dark" : "light";
    document.cookie = `${cookieName}=${value}; Max-Age=31536000; Path=/`;
    subscriber(value);
  }
  schemaMatch.addEventListener("change", handleThemeChange);
  return function cleanupSchemaChange() {
    schemaMatch.removeEventListener("change", handleThemeChange);
  };
}

// node_modules/@epic-web/client-hints/dist/time-zone.js
var clientHint2 = {
  cookieName: "CH-time-zone",
  getValueCode: "Intl.DateTimeFormat().resolvedOptions().timeZone",
  fallback: "UTC"
};

// app/utils/client-hints.tsx
var React3 = __toESM(require_react(), 1);
var import_jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/utils/client-hints.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/client-hints.tsx"
  );
  import.meta.hot.lastModified = "1708316645708.416";
}
var hintsUtils = getHintUtils({
  theme: clientHint,
  timeZone: clientHint2
});
var {
  getHints
} = hintsUtils;
function ClientHintCheck({
  nonce
}) {
  _s3();
  const {
    revalidate
  } = useRevalidator();
  React3.useEffect(() => subscribeToSchemeChange(() => revalidate()), [revalidate]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("script", { nonce, dangerouslySetInnerHTML: {
    __html: hintsUtils.getClientHintCheckScript()
  } }, void 0, false, {
    fileName: "app/utils/client-hints.tsx",
    lineNumber: 52,
    columnNumber: 10
  }, this);
}
_s3(ClientHintCheck, "L1dc0F01n381QK//sAnvnvJbeZg=", false, function() {
  return [useRevalidator];
});
_c3 = ClientHintCheck;
var _c3;
$RefreshReg$(_c3, "ClientHintCheck");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/root.tsx
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_env_server = __toESM(require_env_server(), 1);
var import_honeypot_server = __toESM(require_honeypot_server(), 1);

// app/utils/hslToHex/hslToHex.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/hslToHex/hslToHex.ts"
  );
  import.meta.hot.lastModified = "1706135214538.804";
}
function parseHSL(hsl) {
  const [h, s, l] = hsl.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return [Math.round(h), Math.round(s), Math.round(l)];
}
function getHslFromVar(variable) {
  const hsl = getComputedStyle(document.documentElement).getPropertyValue(
    variable
  );
  return hsl;
}
function hslToHex(hsl) {
  let [h, s, l] = parseHSL(hsl);
  s /= 100;
  l /= 100;
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs(h / 60 % 2 - 1));
  let m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }
  let rHex = Math.round((r + m) * 255).toString(16).padStart(2, "0");
  let gHex = Math.round((g + m) * 255).toString(16).padStart(2, "0");
  let bHex = Math.round((b + m) * 255).toString(16).padStart(2, "0");
  return `#${rHex}${gHex}${bHex}`;
}

// app/root.tsx
var import_nav_state_server = __toESM(require_nav_state_server(), 1);
var import_theme_server = __toESM(require_theme_server(), 1);
var import_timing_server = __toESM(require_timing_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_jsx_dev_runtime4 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/root.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s4 = $RefreshSig$();
var _s23 = $RefreshSig$();
var _s32 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/root.tsx"
  );
}
var links = () => {
  return [
    // Preload CSS as a resource to avoid render blocking
    {
      rel: "preload",
      href: tailwind_default,
      as: "style"
    },
    cssBundleHref ? {
      rel: "preload",
      href: cssBundleHref,
      as: "style"
    } : null,
    {
      rel: "mask-icon",
      href: "/favicons/mask-icon.svg"
    },
    {
      rel: "alternate icon",
      type: "image/png",
      href: "/favicons/favicon-32x32.png"
    },
    {
      rel: "apple-touch-icon",
      href: "/favicons/apple-touch-icon.png"
    },
    {
      rel: "manifest",
      href: "/site.webmanifest",
      crossOrigin: "use-credentials"
    },
    // necessary to make typescript happy
    //These should match the css preloads above to avoid css as render blocking resource
    {
      rel: "icon",
      type: "image/svg+xml",
      href: "/favicons/favicon.svg"
    },
    {
      rel: "stylesheet",
      href: tailwind_default
    },
    cssBundleHref ? {
      rel: "stylesheet",
      href: cssBundleHref
    } : null
  ].filter(Boolean);
};
var meta = ({
  data
}) => {
  return [{
    title: data ? "Yawp!" : "Error | Yawp!"
  }, {
    name: "description",
    content: `Your own captain's log`
  }];
};
function Document({
  children,
  nonce,
  theme = "light",
  env = {}
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("html", { lang: "en", className: cn("h-full overflow-x-hidden", {
    dark: theme === "dark"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("head", { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(ClientHintCheck, { nonce }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 205,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Meta, {}, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 206,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("meta", { charSet: "utf-8" }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 207,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("meta", { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 208,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("meta", { name: "theme-color", content: "#ffffff" }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 210,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Links, {}, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 211,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/root.tsx",
      lineNumber: 204,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("body", { children: [
      children,
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("script", { nonce, dangerouslySetInnerHTML: {
        __html: `window.ENV = ${JSON.stringify(env)}`
      } }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 215,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(ScrollRestoration, { nonce }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 219,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Scripts, { nonce }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 220,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(LiveReload, { nonce }, void 0, false, {
        fileName: "app/root.tsx",
        lineNumber: 221,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/root.tsx",
      lineNumber: 213,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/root.tsx",
    lineNumber: 200,
    columnNumber: 10
  }, this);
}
_c4 = Document;
function App() {
  _s4();
  const data = useLoaderData();
  const nonce = useNonce();
  const theme = useTheme();
  (0, import_react8.useEffect)(() => {
    const meta2 = document.querySelector('meta[name="theme-color"]');
    const newHex = hslToHex(getHslFromVar("--background"));
    meta2?.setAttribute("content", newHex ?? "#ffffff");
  }, [theme]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Document, { nonce, theme, env: data.ENV, children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(GlobalLoading, {}, void 0, false, {
      fileName: "app/root.tsx",
      lineNumber: 237,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "flex h-screen min-h-screen flex-col justify-between", children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "flex-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Outlet, {}, void 0, false, {
      fileName: "app/root.tsx",
      lineNumber: 240,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/root.tsx",
      lineNumber: 239,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/root.tsx",
      lineNumber: 238,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Toaster, { toast: data.toast }, void 0, false, {
      fileName: "app/root.tsx",
      lineNumber: 243,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/root.tsx",
    lineNumber: 236,
    columnNumber: 10
  }, this);
}
_s4(App, "hpKAKuRsCE5S6WIwEuN7GEgfkmY=", false, function() {
  return [useLoaderData, useNonce, useTheme];
});
_c23 = App;
function AppWithProviders() {
  _s23();
  const data = useLoaderData();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(AuthenticityTokenProvider, { token: data.csrfToken, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(HoneypotProvider, { ...data.honeyProps, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(App, {}, void 0, false, {
    fileName: "app/root.tsx",
    lineNumber: 255,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "app/root.tsx",
    lineNumber: 254,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/root.tsx",
    lineNumber: 253,
    columnNumber: 10
  }, this);
}
_s23(AppWithProviders, "5thj+e1edPyRpKif1JmVRC6KArE=", false, function() {
  return [useLoaderData];
});
_c32 = AppWithProviders;
var root_default = _c42 = withSentry(AppWithProviders);
function ErrorBoundary() {
  _s32();
  const nonce = useNonce();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Document, { nonce, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/root.tsx",
    lineNumber: 278,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/root.tsx",
    lineNumber: 277,
    columnNumber: 10
  }, this);
}
_s32(ErrorBoundary, "fTu1PJvfUhwKAAPh1vkoJap6Hoo=", false, function() {
  return [useNonce];
});
_c5 = ErrorBoundary;
var _c4;
var _c23;
var _c32;
var _c42;
var _c5;
$RefreshReg$(_c4, "Document");
$RefreshReg$(_c23, "App");
$RefreshReg$(_c32, "AppWithProviders");
$RefreshReg$(_c42, "%default%");
$RefreshReg$(_c5, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  root_default as default,
  links,
  meta
};
//# sourceMappingURL=/build/root-P6OB4J76.js.map
