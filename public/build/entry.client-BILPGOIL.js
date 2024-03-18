import {
  require_client
} from "/build/_shared/chunk-ZWGWGGVF.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  RemixBrowser
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/entry.client.tsx
var import_react2 = __toESM(require_react(), 1);
var import_client = __toESM(require_client(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/entry.client.tsx"
  );
  import.meta.hot.lastModified = "1704908489724.1562";
}
if (ENV.MODE === "production" && ENV.SENTRY_DSN) {
  import("/build/_shared/monitoring.client-QM4FILCL.js").then(({ init }) => init());
}
(0, import_react2.startTransition)(() => {
  (0, import_client.hydrateRoot)(document, /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(RemixBrowser, {}, void 0, false, {
    fileName: "app/entry.client.tsx",
    lineNumber: 21,
    columnNumber: 24
  }, this));
});
//# sourceMappingURL=/build/entry.client-BILPGOIL.js.map
