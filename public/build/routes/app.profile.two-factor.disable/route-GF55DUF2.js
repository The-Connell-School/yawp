import "/build/_shared/chunk-U4YQU6YB.js";
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
import {
  require_toast_server
} from "/build/_shared/chunk-O7MTR2WV.js";
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
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  useDoubleCheck
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  useFetcher
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

// app/routes/app.profile.two-factor.disable/route.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.two-factor.disable/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.two-factor.disable/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758159.8457";
}
function TwoFactorDisableRoute() {
  _s();
  const disable2FAFetcher = useFetcher();
  const dc = useDoubleCheck();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "max-w-[400px= mx-auto", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(disable2FAFetcher.Form, { method: "POST", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
      fileName: "app/routes/app.profile.two-factor.disable/route.tsx",
      lineNumber: 64,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "mb-2", children: "Disabling two factor authentication is not recommended. However, if you would like to do so, click below." }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor.disable/route.tsx",
      lineNumber: 65,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { variant: dc.doubleCheck ? "destructive" : void 0, ...dc.getButtonProps({
      className: "mx-auto",
      name: "intent",
      value: "disable",
      type: "submit"
    }), children: dc.doubleCheck ? "Are you sure?" : "Disable 2FA" }, void 0, false, {
      fileName: "app/routes/app.profile.two-factor.disable/route.tsx",
      lineNumber: 69,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.two-factor.disable/route.tsx",
    lineNumber: 63,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.profile.two-factor.disable/route.tsx",
    lineNumber: 62,
    columnNumber: 10
  }, this);
}
_s(TwoFactorDisableRoute, "AovRxqD2axCh0khrBhmC7lIcx4g=", false, function() {
  return [useFetcher, useDoubleCheck];
});
_c = TwoFactorDisableRoute;
var _c;
$RefreshReg$(_c, "TwoFactorDisableRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  TwoFactorDisableRoute as default
};
//# sourceMappingURL=/build/routes/app.profile.two-factor.disable/route-GF55DUF2.js.map
