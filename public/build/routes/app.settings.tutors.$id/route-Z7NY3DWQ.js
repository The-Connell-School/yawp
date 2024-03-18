import {
  Route
} from "/build/_shared/chunk-MNBMG2QZ.js";
import {
  require_toast
} from "/build/_shared/chunk-H7EWDU7D.js";
import "/build/_shared/chunk-3XSDGULX.js";
import "/build/_shared/chunk-PSDSLUED.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import "/build/_shared/chunk-3FJOVXYZ.js";
import "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
import "/build/_shared/chunk-G7CHZRZX.js";
import "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
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

// app/routes/app.settings.tutors.$id/route.tsx
var import_db = __toESM(require_db(), 1);
var import_toast = __toESM(require_toast(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.tutors.$id/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.tutors.$id/route.tsx"
  );
  import.meta.hot.lastModified = "1710261911424.403";
}
function Route2() {
  _s();
  const {
    tutor
  } = useLoaderData();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Route, { defaultValue: tutor, isEditing: true }, void 0, false, {
    fileName: "app/routes/app.settings.tutors.$id/route.tsx",
    lineNumber: 126,
    columnNumber: 10
  }, this);
}
_s(Route2, "cw2SqUjvCazf/gSjuNGxbZ6vu40=", false, function() {
  return [useLoaderData];
});
_c = Route2;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.tutors.$id/route.tsx",
    lineNumber: 133,
    columnNumber: 10
  }, this);
}
_c2 = ErrorBoundary;
var _c;
var _c2;
$RefreshReg$(_c, "Route");
$RefreshReg$(_c2, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route2 as default
};
//# sourceMappingURL=/build/routes/app.settings.tutors.$id/route-Z7NY3DWQ.js.map
