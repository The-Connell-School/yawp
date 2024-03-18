import "/build/_shared/chunk-6QH2543B.js";
import {
  require_totp_server
} from "/build/_shared/chunk-U4YQU6YB.js";
import "/build/_shared/chunk-3L2ZJ3AV.js";
import "/build/_shared/chunk-KDBKE6RH.js";
import "/build/_shared/chunk-VOZB6DJP.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import "/build/_shared/chunk-5PDURZFB.js";
import "/build/_shared/chunk-DXKYUF2Y.js";
import "/build/_shared/chunk-L5QMVKXR.js";
import "/build/_shared/chunk-32WNH7JC.js";
import "/build/_shared/chunk-XFJ7VQR3.js";
import "/build/_shared/chunk-SAJ3AEKV.js";
import {
  require_csrf_server
} from "/build/_shared/chunk-YBPZLMI7.js";
import "/build/_shared/chunk-6NMOG26R.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
import "/build/_shared/chunk-ZTUVGTC6.js";
import "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import "/build/_shared/chunk-PIFLCODP.js";
import "/build/_shared/chunk-O7MTR2WV.js";
import "/build/_shared/chunk-N6XLTTDF.js";
import {
  require_auth_server
} from "/build/_shared/chunk-44XOYWRB.js";
import "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Link,
  useFetcher,
  useLoaderData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/app.profile.two-factor._index/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_totp_server = __toESM(require_totp_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.two-factor._index/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.two-factor._index/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758158.5627";
}
function TwoFactorRoute() {
  _s();
  const data = useLoaderData();
  const enable2FAFetcher = useFetcher();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-4", children: data.is2FAEnabled ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_jsx_dev_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-lg", children: "You have enabled two-factor authentication." }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor._index/route.tsx",
      lineNumber: 83,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "disable", className: button({
      className: "w-fit"
    }), children: "Disable 2FA" }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor._index/route.tsx",
      lineNumber: 84,
      columnNumber: 6
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.two-factor._index/route.tsx",
    lineNumber: 82,
    columnNumber: 25
  }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(import_jsx_dev_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "You have not enabled two-factor authentication yet." }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor._index/route.tsx",
      lineNumber: 90,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-sm", children: [
      "Two factor authentication adds an extra layer of security to your account. You will need to enter a code from an authenticator app like",
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("a", { className: "underline", href: "https://1password.com/", children: "1Password" }, void 0, false, {
        fileName: "app/routes/app.profile.two-factor._index/route.tsx",
        lineNumber: 95,
        columnNumber: 7
      }, this),
      " ",
      "to log in."
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.two-factor._index/route.tsx",
      lineNumber: 91,
      columnNumber: 6
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(enable2FAFetcher.Form, { method: "POST", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/app.profile.two-factor._index/route.tsx",
        lineNumber: 101,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", name: "intent", value: "enable", className: "mx-auto", children: "Enable 2FA" }, void 0, false, {
        fileName: "app/routes/app.profile.two-factor._index/route.tsx",
        lineNumber: 102,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.two-factor._index/route.tsx",
      lineNumber: 100,
      columnNumber: 6
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.two-factor._index/route.tsx",
    lineNumber: 89,
    columnNumber: 11
  }, this) }, void 0, false, {
    fileName: "app/routes/app.profile.two-factor._index/route.tsx",
    lineNumber: 81,
    columnNumber: 10
  }, this);
}
_s(TwoFactorRoute, "yAxupoGoWsK4f/JRcCn9FOORomA=", false, function() {
  return [useLoaderData, useFetcher];
});
_c = TwoFactorRoute;
var _c;
$RefreshReg$(_c, "TwoFactorRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  TwoFactorRoute as default
};
//# sourceMappingURL=/build/routes/app.profile.two-factor._index/route-QJ3KPWGF.js.map
