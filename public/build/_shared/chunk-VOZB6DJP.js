import {
  invariant
} from "/build/_shared/chunk-VPD4J5DL.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  getFormProps,
  parseWithZod,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  LaptopIcon,
  MoonIcon,
  SunIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  useFetcher,
  useFetchers,
  useRouteLoaderData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/state/theme.server
var require_theme = __commonJS({
  "empty-module:#app/utils/state/theme.server"(exports, module) {
    module.exports = {};
  }
});

// app/routes/resources+/theme.tsx
var import_node = __toESM(require_node(), 1);

// app/hooks/useRequestInfo.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useRequestInfo.ts"
  );
  import.meta.hot.lastModified = "1705013224988.7769";
}
function useRequestInfo() {
  const data = useRouteLoaderData("root");
  invariant(data?.requestInfo, "No requestInfo found in root loader");
  return data.requestInfo;
}

// app/hooks/useHints.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useHints.ts"
  );
  import.meta.hot.lastModified = "1705013850536.2026";
}
function useHints() {
  const requestInfo = useRequestInfo();
  return requestInfo.hints;
}

// app/routes/resources+/theme.tsx
var import_theme = __toESM(require_theme(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/resources+/theme.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
var _s2 = $RefreshSig$();
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/resources+/theme.tsx"
  );
  import.meta.hot.lastModified = "1709740721770.7896";
}
var ThemeFormSchema = z.object({
  theme: z.enum(["light", "dark"])
});
function useTheme() {
  _s();
  const hints = useHints();
  const requestInfo = useRequestInfo();
  const optimisticMode = useOptimisticThemeMode();
  if (optimisticMode) {
    return optimisticMode;
  }
  return requestInfo.userPrefs.theme ?? hints.theme;
}
_s(useTheme, "JyetDj7pYXDjfsAfIcf5oMOz00Y=", false, function() {
  return [useHints, useRequestInfo, useOptimisticThemeMode];
});
function useOptimisticThemeMode() {
  _s2();
  const fetchers = useFetchers();
  const themeFetcher = fetchers.find((f) => f.formAction === "/resources/theme");
  if (themeFetcher && themeFetcher.formData) {
    const submission = parseWithZod(themeFetcher.formData, {
      schema: ThemeFormSchema
    });
    if (submission.status !== "success" || !submission.value) {
      return;
    }
    return submission.value?.theme;
  }
}
_s2(useOptimisticThemeMode, "ZAoh5/+oZaZzKGX88/4q063VSFM=", false, function() {
  return [useFetchers];
});
function ThemeSwitch({
  buttonProps
}) {
  _s3();
  const fetcher = useFetcher();
  const theme = useTheme();
  const [form] = useForm({
    id: "theme-switch",
    lastResult: fetcher.data
  });
  const optimisticMode = useOptimisticThemeMode();
  const mode = optimisticMode ?? theme ?? "light";
  const nextMode = mode === "dark" ? "light" : "dark";
  const modeLabel = {
    light: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SunIcon, {}, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 115,
      columnNumber: 12
    }, this),
    dark: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(MoonIcon, {}, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 116,
      columnNumber: 11
    }, this),
    system: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(LaptopIcon, {}, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 117,
      columnNumber: 13
    }, this)
  };
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(fetcher.Form, { method: "POST", action: "/resources/theme", ...getFormProps(form), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { type: "hidden", name: "theme", value: nextMode }, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 120,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex gap-2", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Tooltip, { text: "Color mode", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { size: "icon-sm", type: "submit", disabled: ["submitting", "loading"].includes(fetcher.state), ...buttonProps, children: modeLabel[mode] }, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 123,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 122,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 121,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
      fileName: "app/routes/resources+/theme.tsx",
      lineNumber: 128,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/resources+/theme.tsx",
    lineNumber: 119,
    columnNumber: 10
  }, this);
}
_s3(ThemeSwitch, "UUrUBG2xEIe5sP6zWpRsdHEnpmQ=", false, function() {
  return [useFetcher, useTheme, useForm, useOptimisticThemeMode];
});
_c = ThemeSwitch;
var _c;
$RefreshReg$(_c, "ThemeSwitch");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  useRequestInfo,
  useTheme,
  ThemeSwitch
};
//# sourceMappingURL=/build/_shared/chunk-VOZB6DJP.js.map
