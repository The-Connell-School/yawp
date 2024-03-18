import {
  $5d3850c4d0b4e6c7$export$393edc798c47379d,
  $5d3850c4d0b4e6c7$export$41fb9f06171c75f4,
  $5d3850c4d0b4e6c7$export$602eac185826482c,
  $5d3850c4d0b4e6c7$export$7c6e2c02157bb7d2,
  $5d3850c4d0b4e6c7$export$be92b6f5f03c0fe9,
  $5d3850c4d0b4e6c7$export$c6fdb837b070b4ff,
  $5d3850c4d0b4e6c7$export$f39c2d165cd861fe,
  $5d3850c4d0b4e6c7$export$f99233281efd08a0
} from "/build/_shared/chunk-TEC46UIB.js";
import {
  useDebounce
} from "/build/_shared/chunk-ATAELGAQ.js";
import {
  Input
} from "/build/_shared/chunk-FOFHSXAQ.js";
import {
  MagnifyingGlassIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  cn,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  useNavigate,
  useSearchParams
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/components/search-input.tsx
var import_react2 = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/search-input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/search-input.tsx"
  );
  import.meta.hot.lastModified = "1708316645854.4988";
}
function SearchInput() {
  _s();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [searchQuery, setSearchQuery] = (0, import_react2.useState)(initialQuery);
  const isPending = useIsPending();
  const [debouncedSearchQuery, isDebouncing] = useDebounce(searchQuery, 400);
  const navigate = useNavigate();
  const isLoading = isPending || isDebouncing;
  (0, import_react2.useEffect)(() => {
    if (debouncedSearchQuery !== initialQuery) {
      navigate(`${window.location.pathname}?q=${encodeURIComponent(debouncedSearchQuery)}`, {
        replace: true
      });
    }
  }, [debouncedSearchQuery, initialQuery, navigate]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "relative", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(MagnifyingGlassIcon, { className: cn("pointer-events-none absolute left-2.5 top-2.5 h-5 w-5", {
      "opacity-60": isLoading
    }) }, void 0, false, {
      fileName: "app/components/search-input.tsx",
      lineNumber: 46,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Input, { placeholder: "Search", className: "pl-9", defaultValue: searchParams.get("q") ?? "", onChange: (e) => setSearchQuery(e.target.value) }, void 0, false, {
      fileName: "app/components/search-input.tsx",
      lineNumber: 49,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type: "submit", hidden: true }, void 0, false, {
      fileName: "app/components/search-input.tsx",
      lineNumber: 50,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/search-input.tsx",
    lineNumber: 45,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/components/search-input.tsx",
    lineNumber: 44,
    columnNumber: 10
  }, this);
}
_s(SearchInput, "1fqEa2hwoywwWLiZ14myoq9kr7w=", false, function() {
  return [useSearchParams, useIsPending, useDebounce, useNavigate];
});
_c = SearchInput;
var _c;
$RefreshReg$(_c, "SearchInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/ui/drawer.tsx
var React = __toESM(require_react(), 1);

// node_modules/vaul/dist/index.mjs
var import_react3 = __toESM(require_react(), 1);
var import_react4 = __toESM(require_react(), 1);
var import_react5 = __toESM(require_react(), 1);
var ke = __toESM(require_react(), 1);
var import_react6 = __toESM(require_react(), 1);
var import_react7 = __toESM(require_react(), 1);
var import_react8 = __toESM(require_react(), 1);
"use client";
"use client";
var Ee = import_react4.default.createContext({ drawerRef: { current: null }, overlayRef: { current: null }, scaleBackground: () => {
}, onPress: () => {
}, onRelease: () => {
}, onDrag: () => {
}, onNestedDrag: () => {
}, onNestedOpenChange: () => {
}, onNestedRelease: () => {
}, openProp: void 0, dismissible: false, isOpen: false, keyboardIsOpen: { current: false }, snapPointsOffset: null, snapPoints: null, modal: false, shouldFade: false, activeSnapPoint: null, onOpenChange: () => {
}, setActiveSnapPoint: () => {
}, visible: false, closeDrawer: () => {
}, setVisible: () => {
}, direction: "bottom" });
var de = () => import_react4.default.useContext(Ee);
function Te(e, { insertAt: n } = {}) {
  if (!e || typeof document == "undefined")
    return;
  let t = document.head || document.getElementsByTagName("head")[0], r = document.createElement("style");
  r.type = "text/css", n === "top" && t.firstChild ? t.insertBefore(r, t.firstChild) : t.appendChild(r), r.styleSheet ? r.styleSheet.cssText = e : r.appendChild(document.createTextNode(e));
}
Te(`[vaul-drawer]{touch-action:none;transition:transform .5s cubic-bezier(.32,.72,0,1)}[vaul-drawer][vaul-drawer-direction=bottom]{transform:translate3d(0,100%,0)}[vaul-drawer][vaul-drawer-direction=top]{transform:translate3d(0,-100%,0)}[vaul-drawer][vaul-drawer-direction=left]{transform:translate3d(-100%,0,0)}[vaul-drawer][vaul-drawer-direction=right]{transform:translate3d(100%,0,0)}.vaul-dragging .vaul-scrollable [vault-drawer-direction=top],.vaul-dragging .vaul-scrollable [vault-drawer-direction=bottom]{overflow-y:hidden!important}.vaul-dragging .vaul-scrollable [vault-drawer-direction=left],.vaul-dragging .vaul-scrollable [vault-drawer-direction=right]{overflow-x:hidden!important}[vaul-drawer][vaul-drawer-visible=true][vaul-drawer-direction=top],[vaul-drawer][vaul-drawer-visible=true][vaul-drawer-direction=bottom]{transform:translate3d(0,var(--snap-point-height, 0),0)}[vaul-drawer][vaul-drawer-visible=true][vaul-drawer-direction=left],[vaul-drawer][vaul-drawer-visible=true][vaul-drawer-direction=right]{transform:translate3d(var(--snap-point-height, 0),0,0)}[vaul-overlay]{opacity:0;transition:opacity .5s cubic-bezier(.32,.72,0,1)}[vaul-overlay][vaul-drawer-visible=true]{opacity:1}[vaul-drawer]:after{content:"";position:absolute;background:inherit;background-color:inherit}[vaul-drawer][vaul-drawer-direction=top]:after{top:initial;bottom:100%;left:0;right:0;height:200%}[vaul-drawer][vaul-drawer-direction=bottom]:after{top:100%;bottom:initial;left:0;right:0;height:200%}[vaul-drawer][vaul-drawer-direction=left]:after{left:initial;right:100%;top:0;bottom:0;width:200%}[vaul-drawer][vaul-drawer-direction=right]:after{left:100%;right:initial;top:0;bottom:0;width:200%}[vaul-overlay][vaul-snap-points=true]:not([vaul-snap-points-overlay="true"]):not([data-state="closed"]){opacity:0}[vaul-overlay][vaul-snap-points-overlay=true]:not([vaul-drawer-visible="false"]){opacity:1}@keyframes fake-animation{}@media (hover: hover) and (pointer: fine){[vaul-drawer]{user-select:none}}
`);
var bt = typeof window != "undefined" ? import_react5.useLayoutEffect : import_react5.useEffect;
function Se(...e) {
  return (...n) => {
    for (let t of e)
      typeof t == "function" && t(...n);
  };
}
function vt() {
  return xe(/^Mac/);
}
function wt() {
  return xe(/^iPhone/);
}
function ht() {
  return xe(/^iPad/) || vt() && navigator.maxTouchPoints > 1;
}
function Re() {
  return wt() || ht();
}
function xe(e) {
  return typeof window != "undefined" && window.navigator != null ? e.test(window.navigator.platform) : void 0;
}
var ye = typeof document != "undefined" && window.visualViewport;
function We(e) {
  let n = window.getComputedStyle(e);
  return /(auto|scroll)/.test(n.overflow + n.overflowX + n.overflowY);
}
function Ue(e) {
  for (We(e) && (e = e.parentElement); e && !We(e); )
    e = e.parentElement;
  return e || document.scrollingElement || document.documentElement;
}
var Et = /* @__PURE__ */ new Set(["checkbox", "radio", "range", "color", "file", "image", "button", "submit", "reset"]);
var me = 0;
var De;
function je(e = {}) {
  let { isDisabled: n } = e;
  bt(() => {
    if (!n)
      return me++, me === 1 && (Re() ? De = yt() : De = Tt()), () => {
        me--, me === 0 && De();
      };
  }, [n]);
}
function Tt() {
  return Se(Be(document.documentElement, "paddingRight", `${window.innerWidth - document.documentElement.clientWidth}px`));
}
function yt() {
  let e, n = 0, t = (v) => {
    e = Ue(v.target), !(e === document.documentElement && e === document.body) && (n = v.changedTouches[0].pageY);
  }, r = (v) => {
    if (!e || e === document.documentElement || e === document.body) {
      v.preventDefault();
      return;
    }
    let f = v.changedTouches[0].pageY, u = e.scrollTop, $ = e.scrollHeight - e.clientHeight;
    $ !== 0 && ((u <= 0 && f > n || u >= $ && f < n) && v.preventDefault(), n = f);
  }, a = (v) => {
    let f = v.target;
    ae(f) && f !== document.activeElement && (v.preventDefault(), f.style.transform = "translateY(-2000px)", f.focus(), requestAnimationFrame(() => {
      f.style.transform = "";
    }));
  }, o = (v) => {
    let f = v.target;
    ae(f) && (f.style.transform = "translateY(-2000px)", requestAnimationFrame(() => {
      f.style.transform = "", ye && (ye.height < window.innerHeight ? requestAnimationFrame(() => {
        Fe(f);
      }) : ye.addEventListener("resize", () => Fe(f), { once: true }));
    }));
  }, s = () => {
    window.scrollTo(0, 0);
  }, p = window.pageXOffset, H = window.pageYOffset, x = Se(Be(document.documentElement, "paddingRight", `${window.innerWidth - document.documentElement.clientWidth}px`));
  window.scrollTo(0, 0);
  let S = Se(ie(document, "touchstart", t, { passive: false, capture: true }), ie(document, "touchmove", r, { passive: false, capture: true }), ie(document, "touchend", a, { passive: false, capture: true }), ie(document, "focus", o, true), ie(window, "scroll", s));
  return () => {
    x(), S(), window.scrollTo(p, H);
  };
}
function Be(e, n, t) {
  let r = e.style[n];
  return e.style[n] = t, () => {
    e.style[n] = r;
  };
}
function ie(e, n, t, r) {
  return e.addEventListener(n, t, r), () => {
    e.removeEventListener(n, t, r);
  };
}
function Fe(e) {
  let n = document.scrollingElement || document.documentElement;
  for (; e && e !== n; ) {
    let t = Ue(e);
    if (t !== document.documentElement && t !== document.body && t !== e) {
      let r = t.getBoundingClientRect().top, a = e.getBoundingClientRect().top, o = e.getBoundingClientRect().bottom, s = t.getBoundingClientRect().bottom;
      o > s && (t.scrollTop += a - r);
    }
    e = t.parentElement;
  }
}
function ae(e) {
  return e instanceof HTMLInputElement && !Et.has(e.type) || e instanceof HTMLTextAreaElement || e instanceof HTMLElement && e.isContentEditable;
}
function Dt(e, n) {
  typeof e == "function" ? e(n) : e != null && (e.current = n);
}
function St(...e) {
  return (n) => e.forEach((t) => Dt(t, n));
}
function He(...e) {
  return ke.useCallback(St(...e), e);
}
var F = null;
function ze({ isOpen: e, modal: n, nested: t, hasBeenOpened: r, preventScrollRestoration: a }) {
  let [o, s] = import_react6.default.useState(typeof window != "undefined" ? window.location.href : ""), p = import_react6.default.useRef(0);
  function H() {
    if (F === null && e) {
      F = { position: document.body.style.position, top: document.body.style.top, left: document.body.style.left, height: document.body.style.height };
      let { scrollX: S, innerHeight: v } = window;
      document.body.style.setProperty("position", "fixed", "important"), document.body.style.top = `${-p.current}px`, document.body.style.left = `${-S}px`, document.body.style.right = "0px", document.body.style.height = "auto", setTimeout(() => requestAnimationFrame(() => {
        let f = v - window.innerHeight;
        f && p.current >= v && (document.body.style.top = `${-(p.current + f)}px`);
      }), 300);
    }
  }
  function x() {
    if (F !== null) {
      let S = -parseInt(document.body.style.top, 10), v = -parseInt(document.body.style.left, 10);
      document.body.style.position = F.position, document.body.style.top = F.top, document.body.style.left = F.left, document.body.style.height = F.height, document.body.style.right = "unset", requestAnimationFrame(() => {
        if (a && o !== window.location.href) {
          s(window.location.href);
          return;
        }
        window.scrollTo(v, S);
      }), F = null;
    }
  }
  return import_react6.default.useEffect(() => {
    function S() {
      p.current = window.scrollY;
    }
    return S(), window.addEventListener("scroll", S), () => {
      window.removeEventListener("scroll", S);
    };
  }, []), import_react6.default.useEffect(() => {
    t || !r || (e ? (H(), n || setTimeout(() => {
      x();
    }, 500)) : x());
  }, [e, r, o]), { restorePositionSetting: x };
}
var Ye = /* @__PURE__ */ new WeakMap();
function y(e, n, t = false) {
  if (!e || !(e instanceof HTMLElement) || !n)
    return;
  let r = {};
  Object.entries(n).forEach(([a, o]) => {
    if (a.startsWith("--")) {
      e.style.setProperty(a, o);
      return;
    }
    r[a] = e.style[a], e.style[a] = o;
  }), !t && Ye.set(e, r);
}
function K(e, n) {
  if (!e || !(e instanceof HTMLElement))
    return;
  let t = Ye.get(e);
  t && (n ? e.style[n] = t[n] : Object.entries(t).forEach(([r, a]) => {
    e.style[r] = a;
  }));
}
var R = (e) => {
  switch (e) {
    case "top":
    case "bottom":
      return true;
    case "left":
    case "right":
      return false;
    default:
      return e;
  }
};
function le(e, n) {
  let t = window.getComputedStyle(e), r = t.transform || t.webkitTransform || t.mozTransform, a = r.match(/^matrix3d\((.+)\)$/);
  return a ? parseFloat(a[1].split(", ")[R(n) ? 13 : 12]) : (a = r.match(/^matrix\((.+)\)$/), a ? parseFloat(a[1].split(", ")[R(n) ? 5 : 4]) : null);
}
function _e(e) {
  return 8 * (Math.log(e + 1) - 2);
}
var T = { DURATION: 0.5, EASE: [0.32, 0.72, 0, 1] };
var pe = 0.4;
function qe(e) {
  let n = import_react8.default.useRef(e);
  return import_react8.default.useEffect(() => {
    n.current = e;
  }), import_react8.default.useMemo(() => (...t) => {
    var r;
    return (r = n.current) == null ? void 0 : r.call(n, ...t);
  }, []);
}
function Rt({ defaultProp: e, onChange: n }) {
  let t = import_react8.default.useState(e), [r] = t, a = import_react8.default.useRef(r), o = qe(n);
  return import_react8.default.useEffect(() => {
    a.current !== r && (o(r), a.current = r);
  }, [r, a, o]), t;
}
function Xe({ prop: e, defaultProp: n, onChange: t = () => {
} }) {
  let [r, a] = Rt({ defaultProp: n, onChange: t }), o = e !== void 0, s = o ? e : r, p = qe(t), H = import_react8.default.useCallback((x) => {
    if (o) {
      let v = typeof x == "function" ? x(e) : x;
      v !== e && p(v);
    } else
      a(x);
  }, [o, e, a, p]);
  return [s, H];
}
function Ke({ activeSnapPointProp: e, setActiveSnapPointProp: n, snapPoints: t, drawerRef: r, overlayRef: a, fadeFromIndex: o, onSnapPointChange: s, direction: p = "bottom" }) {
  let [H, x] = Xe({ prop: e, defaultProp: t == null ? void 0 : t[0], onChange: n }), S = import_react7.default.useMemo(() => H === (t == null ? void 0 : t[t.length - 1]), [t, H]), v = t && t.length > 0 && (o || o === 0) && !Number.isNaN(o) && t[o] === H || !t, f = import_react7.default.useMemo(() => {
    var m;
    return (m = t == null ? void 0 : t.findIndex((b) => b === H)) != null ? m : null;
  }, [t, H]), u = import_react7.default.useMemo(() => {
    var m;
    return (m = t == null ? void 0 : t.map((b) => {
      let w = typeof window != "undefined", C = typeof b == "string", A = 0;
      if (C && (A = parseInt(b, 10)), R(p)) {
        let P = C ? A : w ? b * window.innerHeight : 0;
        return w ? p === "bottom" ? window.innerHeight - P : -window.innerHeight + P : P;
      }
      let N = C ? A : w ? b * window.innerWidth : 0;
      return w ? p === "right" ? window.innerWidth - N : -window.innerWidth + N : N;
    })) != null ? m : [];
  }, [t]), $ = import_react7.default.useMemo(() => f !== null ? u == null ? void 0 : u[f] : null, [u, f]), I = import_react7.default.useCallback((m) => {
    var w;
    let b = (w = u == null ? void 0 : u.findIndex((C) => C === m)) != null ? w : null;
    s(b), y(r.current, { transition: `transform ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, transform: R(p) ? `translate3d(0, ${m}px, 0)` : `translate3d(${m}px, 0, 0)` }), u && b !== u.length - 1 && b !== o ? y(a.current, { transition: `opacity ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, opacity: "0" }) : y(a.current, { transition: `opacity ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, opacity: "1" }), x(b !== null ? t == null ? void 0 : t[b] : null);
  }, [r.current, t, u, o, a, x]);
  import_react7.default.useEffect(() => {
    var m;
    if (e) {
      let b = (m = t == null ? void 0 : t.findIndex((w) => w === e)) != null ? m : null;
      u && b && typeof u[b] == "number" && I(u[b]);
    }
  }, [e, t, u, I]);
  function U({ draggedDistance: m, closeDrawer: b, velocity: w, dismissible: C }) {
    if (o === void 0)
      return;
    let A = p === "bottom" || p === "right" ? $ != null ? $ : 0 - m : $ != null ? $ : 0 + m, N = f === o - 1, P = f === 0, Q = m > 0;
    if (N && y(a.current, { transition: `opacity ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})` }), w > 2 && !Q) {
      C ? b() : I(u[0]);
      return;
    }
    if (w > 2 && Q && u && t) {
      I(u[t.length - 1]);
      return;
    }
    let Z = u == null ? void 0 : u.reduce((V, Y) => typeof V != "number" || typeof Y != "number" ? V : Math.abs(Y - A) < Math.abs(V - A) ? Y : V), se = R(p) ? window.innerHeight : window.innerWidth;
    if (w > pe && Math.abs(m) < se * 0.4) {
      let V = Q ? 1 : -1;
      if (V > 0 && S) {
        I(u[t.length - 1]);
        return;
      }
      if (P && V < 0 && C && b(), f === null)
        return;
      I(u[f + V]);
      return;
    }
    I(Z);
  }
  function d({ draggedDistance: m }) {
    if ($ === null)
      return;
    let b = p === "bottom" || p === "right" ? $ - m : $ + m;
    (p === "bottom" || p === "right") && b < u[u.length - 1] || (p === "top" || p === "left") && b > u[u.length - 1] || y(r.current, { transform: R(p) ? `translate3d(0, ${b}px, 0)` : `translate3d(${b}px, 0, 0)` });
  }
  function J(m, b) {
    if (!t || typeof f != "number" || !u || o === void 0)
      return null;
    let w = f === o - 1;
    if (f >= o && b)
      return 0;
    if (w && !b)
      return 1;
    if (!v && !w)
      return null;
    let A = w ? f + 1 : f - 1, N = w ? u[A] - u[A - 1] : u[A + 1] - u[A], P = m / Math.abs(N);
    return w ? 1 - P : P;
  }
  return { isLastSnapPoint: S, activeSnapPoint: H, shouldFade: v, getPercentageDragged: J, setActiveSnapPoint: x, activeSnapPointIndex: f, onRelease: U, onDrag: d, snapPointsOffset: u };
}
var xt = 0.25;
var Ht = 100;
var Ge = 8;
var z = 16;
var Je = 26;
var Qe = "vaul-dragging";
function Ze({ open: e, onOpenChange: n, children: t, shouldScaleBackground: r, onDrag: a, onRelease: o, snapPoints: s, nested: p = false, closeThreshold: H = xt, scrollLockTimeout: x = Ht, dismissible: S = true, fadeFromIndex: v = s && s.length - 1, activeSnapPoint: f, setActiveSnapPoint: u, fixed: $, modal: I = true, onClose: U, direction: d = "bottom", preventScrollRestoration: J = true }) {
  var Ne;
  let [m = false, b] = import_react3.default.useState(false), [w, C] = import_react3.default.useState(false), [A, N] = import_react3.default.useState(false), [P, Q] = import_react3.default.useState(false), [Z, se] = import_react3.default.useState(false), [V, Y] = import_react3.default.useState(false), j = import_react3.default.useRef(null), ue = import_react3.default.useRef(null), be = import_react3.default.useRef(null), Me = import_react3.default.useRef(null), ee = import_react3.default.useRef(null), te = import_react3.default.useRef(false), ve = import_react3.default.useRef(null), we = import_react3.default.useRef(0), _ = import_react3.default.useRef(false), $e = import_react3.default.useRef(0), l = import_react3.default.useRef(null), Le = import_react3.default.useRef(((Ne = l.current) == null ? void 0 : Ne.getBoundingClientRect().height) || 0), he = import_react3.default.useRef(0), nt = import_react3.default.useCallback((i) => {
    s && i === re.length - 1 && (ue.current = /* @__PURE__ */ new Date());
  }, []), { activeSnapPoint: rt, activeSnapPointIndex: ne, setActiveSnapPoint: Ce, onRelease: ot, snapPointsOffset: re, onDrag: it, shouldFade: Ae, getPercentageDragged: at } = Ke({ snapPoints: s, activeSnapPointProp: f, setActiveSnapPointProp: u, drawerRef: l, fadeFromIndex: v, overlayRef: j, onSnapPointChange: nt, direction: d });
  je({ isDisabled: !m || Z || !I || V || !w });
  let { restorePositionSetting: lt } = ze({ isOpen: m, modal: I, nested: p, hasBeenOpened: w, preventScrollRestoration: J });
  function q() {
    return (window.innerWidth - Je) / window.innerWidth;
  }
  function st(i) {
    var c;
    !S && !s || l.current && !l.current.contains(i.target) || (Le.current = ((c = l.current) == null ? void 0 : c.getBoundingClientRect().height) || 0, se(true), be.current = /* @__PURE__ */ new Date(), Re() && window.addEventListener("touchend", () => te.current = false, { once: true }), i.target.setPointerCapture(i.pointerId), we.current = R(d) ? i.screenY : i.screenX);
  }
  function Oe(i, c) {
    var O;
    let h = i, E = (O = window.getSelection()) == null ? void 0 : O.toString(), D = l.current ? le(l.current, d) : null, M = /* @__PURE__ */ new Date();
    if (ue.current && M.getTime() - ue.current.getTime() < 500)
      return false;
    if (D !== null && (d === "bottom" || d === "right" ? D > 0 : D < 0))
      return true;
    if (E && E.length > 0)
      return false;
    if (ee.current && M.getTime() - ee.current.getTime() < x && D === 0 || c)
      return ee.current = M, false;
    for (; h; ) {
      if (h.scrollHeight > h.clientHeight) {
        if (h.scrollTop !== 0)
          return ee.current = /* @__PURE__ */ new Date(), false;
        if (h.getAttribute("role") === "dialog")
          return true;
      }
      h = h.parentNode;
    }
    return true;
  }
  function ut(i) {
    if (l.current && Z) {
      let c = d === "bottom" || d === "right" ? 1 : -1, h = (we.current - (R(d) ? i.screenY : i.screenX)) * c, E = h > 0;
      if (s && ne === 0 && !S || !te.current && !Oe(i.target, E))
        return;
      if (l.current.classList.add(Qe), te.current = true, y(l.current, { transition: "none" }), y(j.current, { transition: "none" }), s && it({ draggedDistance: h }), E && !s) {
        let W = _e(h), fe = Math.min(W * -1, 0) * c;
        y(l.current, { transform: R(d) ? `translate3d(0, ${fe}px, 0)` : `translate3d(${fe}px, 0, 0)` });
        return;
      }
      let D = Math.abs(h), M = document.querySelector("[vaul-drawer-wrapper]"), O = D / Le.current, oe = at(D, E);
      oe !== null && (O = oe);
      let B = 1 - O;
      if ((Ae || v && ne === v - 1) && (a == null || a(i, O), y(j.current, { opacity: `${B}`, transition: "none" }, true)), M && j.current && r) {
        let W = Math.min(q() + O * (1 - q()), 1), fe = 8 - O * 8, Pe = Math.max(0, 14 - O * 14);
        y(M, { borderRadius: `${fe}px`, transform: R(d) ? `scale(${W}) translate3d(0, ${Pe}px, 0)` : `scale(${W}) translate3d(${Pe}px, 0, 0)`, transition: "none" }, true);
      }
      if (!s) {
        let W = D * c;
        y(l.current, { transform: R(d) ? `translate3d(0, ${W}px, 0)` : `translate3d(${W}px, 0, 0)` });
      }
    }
  }
  import_react3.default.useEffect(() => () => {
    ce(false), lt();
  }, []), import_react3.default.useEffect(() => {
    var c;
    function i() {
      var E;
      if (!l.current)
        return;
      let h = document.activeElement;
      if (ae(h) || _.current) {
        let D = ((E = window.visualViewport) == null ? void 0 : E.height) || 0, M = window.innerHeight - D, O = l.current.getBoundingClientRect().height || 0;
        he.current || (he.current = O);
        let oe = l.current.getBoundingClientRect().top;
        if (Math.abs($e.current - M) > 60 && (_.current = !_.current), s && s.length > 0 && re && ne) {
          let B = re[ne] || 0;
          M += B;
        }
        if ($e.current = M, O > D || _.current) {
          let B = l.current.getBoundingClientRect().height, W = B;
          B > D && (W = D - Je), $ ? l.current.style.height = `${B - Math.max(M, 0)}px` : l.current.style.height = `${Math.max(W, D - oe)}px`;
        } else
          l.current.style.height = `${he.current}px`;
        s && s.length > 0 && !_.current ? l.current.style.bottom = "0px" : l.current.style.bottom = `${Math.max(M, 0)}px`;
      }
    }
    return (c = window.visualViewport) == null || c.addEventListener("resize", i), () => {
      var h;
      return (h = window.visualViewport) == null ? void 0 : h.removeEventListener("resize", i);
    };
  }, [ne, s, re]);
  function X() {
    l.current && (U == null || U(), y(l.current, { transform: R(d) ? `translate3d(0, ${d === "bottom" ? "100%" : "-100%"}, 0)` : `translate3d(${d === "right" ? "100%" : "-100%"}, 0, 0)`, transition: `transform ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})` }), y(j.current, { opacity: "0", transition: `opacity ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})` }), ce(false), setTimeout(() => {
      N(false), b(false);
    }, 300), setTimeout(() => {
      K(document.documentElement, "scrollBehavior"), s && Ce(s[0]);
    }, T.DURATION * 1e3));
  }
  import_react3.default.useEffect(() => {
    if (!m && r) {
      let i = setTimeout(() => {
        K(document.body);
      }, 200);
      return () => clearTimeout(i);
    }
  }, [m, r]), import_react3.default.useEffect(() => {
    e ? (b(true), C(true)) : X();
  }, [e]), import_react3.default.useEffect(() => {
    P && (n == null || n(m));
  }, [m]), import_react3.default.useEffect(() => {
    Q(true);
  }, []);
  function Ie() {
    if (!l.current)
      return;
    let i = document.querySelector("[vaul-drawer-wrapper]"), c = le(l.current, d);
    y(l.current, { transform: "translate3d(0, 0, 0)", transition: `transform ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})` }), y(j.current, { transition: `opacity ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, opacity: "1" }), r && c && c > 0 && m && y(i, { borderRadius: `${Ge}px`, overflow: "hidden", ...R(d) ? { transform: `scale(${q()}) translate3d(0, calc(env(safe-area-inset-top) + 14px), 0)`, transformOrigin: "top" } : { transform: `scale(${q()}) translate3d(calc(env(safe-area-inset-top) + 14px), 0, 0)`, transformOrigin: "left" }, transitionProperty: "transform, border-radius", transitionDuration: `${T.DURATION}s`, transitionTimingFunction: `cubic-bezier(${T.EASE.join(",")})` }, true);
  }
  function ct(i) {
    var O;
    if (!Z || !l.current)
      return;
    te.current && ae(i.target) && i.target.blur(), l.current.classList.remove(Qe), te.current = false, se(false), Me.current = /* @__PURE__ */ new Date();
    let c = le(l.current, d);
    if (!Oe(i.target, false) || !c || Number.isNaN(c) || be.current === null)
      return;
    let h = Me.current.getTime() - be.current.getTime(), E = we.current - (R(d) ? i.screenY : i.screenX), D = Math.abs(E) / h;
    if (D > 0.05 && (Y(true), setTimeout(() => {
      Y(false);
    }, 200)), s) {
      ot({ draggedDistance: E * (d === "bottom" || d === "right" ? 1 : -1), closeDrawer: X, velocity: D, dismissible: S }), o == null || o(i, true);
      return;
    }
    if (d === "bottom" || d === "right" ? E > 0 : E < 0) {
      Ie(), o == null || o(i, true);
      return;
    }
    if (D > pe) {
      X(), o == null || o(i, false);
      return;
    }
    let M = Math.min((O = l.current.getBoundingClientRect().height) != null ? O : 0, window.innerHeight);
    if (c >= M * H) {
      X(), o == null || o(i, false);
      return;
    }
    o == null || o(i, true), Ie();
  }
  import_react3.default.useEffect(() => {
    m && (y(document.documentElement, { scrollBehavior: "auto" }), ue.current = /* @__PURE__ */ new Date(), ce(true));
  }, [m]), import_react3.default.useEffect(() => {
    var i;
    if (l.current && A) {
      let c = (i = l == null ? void 0 : l.current) == null ? void 0 : i.querySelectorAll("*");
      c == null || c.forEach((h) => {
        let E = h;
        (E.scrollHeight > E.clientHeight || E.scrollWidth > E.clientWidth) && E.classList.add("vaul-scrollable");
      });
    }
  }, [A]);
  function ce(i) {
    let c = document.querySelector("[vaul-drawer-wrapper]");
    !c || !r || (i ? (y(document.body, { background: "black" }, true), y(c, { borderRadius: `${Ge}px`, overflow: "hidden", ...R(d) ? { transform: `scale(${q()}) translate3d(0, calc(env(safe-area-inset-top) + 14px), 0)`, transformOrigin: "top" } : { transform: `scale(${q()}) translate3d(calc(env(safe-area-inset-top) + 14px), 0, 0)`, transformOrigin: "left" }, transitionProperty: "transform, border-radius", transitionDuration: `${T.DURATION}s`, transitionTimingFunction: `cubic-bezier(${T.EASE.join(",")})` })) : (K(c, "overflow"), K(c, "transform"), K(c, "borderRadius"), y(c, { transitionProperty: "transform, border-radius", transitionDuration: `${T.DURATION}s`, transitionTimingFunction: `cubic-bezier(${T.EASE.join(",")})` })));
  }
  function ft(i) {
    let c = i ? (window.innerWidth - z) / window.innerWidth : 1, h = i ? -z : 0;
    ve.current && window.clearTimeout(ve.current), y(l.current, { transition: `transform ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, transform: `scale(${c}) translate3d(0, ${h}px, 0)` }), !i && l.current && (ve.current = setTimeout(() => {
      let E = le(l.current, d);
      y(l.current, { transition: "none", transform: R(d) ? `translate3d(0, ${E}px, 0)` : `translate3d(${E}px, 0, 0)` });
    }, 500));
  }
  function dt(i, c) {
    if (c < 0)
      return;
    let h = R(d) ? window.innerHeight : window.innerWidth, E = (h - z) / h, D = E + c * (1 - E), M = -z + c * z;
    y(l.current, { transform: R(d) ? `scale(${D}) translate3d(0, ${M}px, 0)` : `scale(${D}) translate3d(${M}px, 0, 0)`, transition: "none" });
  }
  function mt(i, c) {
    let h = R(d) ? window.innerHeight : window.innerWidth, E = c ? (h - z) / h : 1, D = c ? -z : 0;
    c && y(l.current, { transition: `transform ${T.DURATION}s cubic-bezier(${T.EASE.join(",")})`, transform: R(d) ? `scale(${E}) translate3d(0, ${D}px, 0)` : `scale(${E}) translate3d(${D}px, 0, 0)` });
  }
  return import_react3.default.createElement($5d3850c4d0b4e6c7$export$be92b6f5f03c0fe9, { modal: I, onOpenChange: (i) => {
    if (e !== void 0) {
      n == null || n(i);
      return;
    }
    i ? (C(true), b(i)) : X();
  }, open: m }, import_react3.default.createElement(Ee.Provider, { value: { visible: A, activeSnapPoint: rt, snapPoints: s, setActiveSnapPoint: Ce, drawerRef: l, overlayRef: j, scaleBackground: ce, onOpenChange: n, onPress: st, setVisible: N, onRelease: ct, onDrag: ut, dismissible: S, isOpen: m, shouldFade: Ae, closeDrawer: X, onNestedDrag: dt, onNestedOpenChange: ft, onNestedRelease: mt, keyboardIsOpen: _, openProp: e, modal: I, snapPointsOffset: re, direction: d } }, t));
}
var et = import_react3.default.forwardRef(function({ children: e, ...n }, t) {
  let { overlayRef: r, snapPoints: a, onRelease: o, shouldFade: s, isOpen: p, visible: H } = de(), x = He(t, r), S = a && a.length > 0;
  return import_react3.default.createElement($5d3850c4d0b4e6c7$export$c6fdb837b070b4ff, { onMouseUp: o, ref: x, "vaul-drawer-visible": H ? "true" : "false", "vaul-overlay": "", "vaul-snap-points": p && S ? "true" : "false", "vaul-snap-points-overlay": p && s ? "true" : "false", ...n });
});
et.displayName = "Drawer.Overlay";
var tt = import_react3.default.forwardRef(function({ onOpenAutoFocus: e, onPointerDownOutside: n, onAnimationEnd: t, style: r, ...a }, o) {
  let { drawerRef: s, onPress: p, onRelease: H, onDrag: x, dismissible: S, keyboardIsOpen: v, snapPointsOffset: f, visible: u, closeDrawer: $, modal: I, openProp: U, onOpenChange: d, setVisible: J, direction: m } = de(), b = He(o, s);
  return import_react3.default.useEffect(() => {
    J(true);
  }, []), import_react3.default.createElement($5d3850c4d0b4e6c7$export$7c6e2c02157bb7d2, { onOpenAutoFocus: (w) => {
    var C;
    e ? e(w) : (w.preventDefault(), (C = s.current) == null || C.focus());
  }, onPointerDown: p, onPointerDownOutside: (w) => {
    if (n == null || n(w), !I) {
      w.preventDefault();
      return;
    }
    v.current && (v.current = false), w.preventDefault(), d == null || d(false), !(!S || U !== void 0) && $();
  }, onPointerMove: x, onPointerUp: H, ref: b, style: f && f.length > 0 ? { "--snap-point-height": `${f[0]}px`, ...r } : r, ...a, "vaul-drawer": "", "vaul-drawer-direction": m, "vaul-drawer-visible": u ? "true" : "false" });
});
tt.displayName = "Drawer.Content";
function Mt({ onDrag: e, onOpenChange: n, ...t }) {
  let { onNestedDrag: r, onNestedOpenChange: a, onNestedRelease: o } = de();
  if (!r)
    throw new Error("Drawer.NestedRoot must be placed in another drawer");
  return import_react3.default.createElement(Ze, { nested: true, onClose: () => {
    a(false);
  }, onDrag: (s, p) => {
    r(s, p), e == null || e(s, p);
  }, onOpenChange: (s) => {
    s && a(s), n == null || n(s);
  }, onRelease: o, ...t });
}
var nn = { Root: Ze, NestedRoot: Mt, Content: tt, Overlay: et, Trigger: $5d3850c4d0b4e6c7$export$41fb9f06171c75f4, Portal: $5d3850c4d0b4e6c7$export$602eac185826482c, Close: $5d3850c4d0b4e6c7$export$f39c2d165cd861fe, Title: $5d3850c4d0b4e6c7$export$f99233281efd08a0, Description: $5d3850c4d0b4e6c7$export$393edc798c47379d };

// app/components/ui/drawer.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/drawer.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/drawer.tsx"
  );
  import.meta.hot.lastModified = "1708316645855.1287";
}
var Drawer = ({
  shouldScaleBackground = true,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(nn.Root, { shouldScaleBackground, ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 27,
  columnNumber: 7
}, this);
_c2 = Drawer;
Drawer.displayName = "Drawer";
var DrawerTrigger = nn.Trigger;
var DrawerPortal = nn.Portal;
var DrawerClose = nn.Close;
var DrawerOverlay = React.forwardRef(_c22 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(nn.Overlay, { ref, className: cn("fixed inset-0 z-50 bg-black/80", className), ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 36,
  columnNumber: 12
}, this));
_c3 = DrawerOverlay;
DrawerOverlay.displayName = nn.Overlay.displayName;
var DrawerContent = React.forwardRef(_c4 = ({
  className,
  children,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(DrawerPortal, { children: [
  /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(DrawerOverlay, {}, void 0, false, {
    fileName: "app/components/ui/drawer.tsx",
    lineNumber: 44,
    columnNumber: 5
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(nn.Content, { ref, className: cn("fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background", className), ...props, children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" }, void 0, false, {
      fileName: "app/components/ui/drawer.tsx",
      lineNumber: 46,
      columnNumber: 7
    }, this),
    children
  ] }, void 0, true, {
    fileName: "app/components/ui/drawer.tsx",
    lineNumber: 45,
    columnNumber: 5
  }, this)
] }, void 0, true, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 43,
  columnNumber: 12
}, this));
_c5 = DrawerContent;
DrawerContent.displayName = "DrawerContent";
var DrawerHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("grid gap-1.5 p-4 text-center sm:text-left", className), ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 55,
  columnNumber: 7
}, this);
_c6 = DrawerHeader;
DrawerHeader.displayName = "DrawerHeader";
var DrawerFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("mt-auto flex flex-col gap-2 p-4", className), ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 61,
  columnNumber: 7
}, this);
_c7 = DrawerFooter;
DrawerFooter.displayName = "DrawerFooter";
var DrawerTitle = React.forwardRef(_c8 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(nn.Title, { ref, className: cn("text-lg font-semibold leading-none tracking-tight", className), ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 67,
  columnNumber: 12
}, this));
_c9 = DrawerTitle;
DrawerTitle.displayName = nn.Title.displayName;
var DrawerDescription = React.forwardRef(_c10 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(nn.Description, { ref, className: cn("text-sm text-muted-foreground", className), ...props }, void 0, false, {
  fileName: "app/components/ui/drawer.tsx",
  lineNumber: 73,
  columnNumber: 12
}, this));
_c11 = DrawerDescription;
DrawerDescription.displayName = nn.Description.displayName;
var _c2;
var _c22;
var _c3;
var _c4;
var _c5;
var _c6;
var _c7;
var _c8;
var _c9;
var _c10;
var _c11;
$RefreshReg$(_c2, "Drawer");
$RefreshReg$(_c22, "DrawerOverlay$React.forwardRef");
$RefreshReg$(_c3, "DrawerOverlay");
$RefreshReg$(_c4, "DrawerContent$React.forwardRef");
$RefreshReg$(_c5, "DrawerContent");
$RefreshReg$(_c6, "DrawerHeader");
$RefreshReg$(_c7, "DrawerFooter");
$RefreshReg$(_c8, "DrawerTitle$React.forwardRef");
$RefreshReg$(_c9, "DrawerTitle");
$RefreshReg$(_c10, "DrawerDescription$React.forwardRef");
$RefreshReg$(_c11, "DrawerDescription");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  SearchInput,
  Drawer,
  DrawerContent
};
//# sourceMappingURL=/build/_shared/chunk-FG2Z67HN.js.map
