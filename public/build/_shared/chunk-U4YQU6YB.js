import {
  useTheme
} from "/build/_shared/chunk-VOZB6DJP.js";
import {
  FormCheckbox,
  require_honeypot_server
} from "/build/_shared/chunk-32WNH7JC.js";
import {
  require_session_server
} from "/build/_shared/chunk-SAJ3AEKV.js";
import {
  require_csrf_server
} from "/build/_shared/chunk-YBPZLMI7.js";
import {
  HoneypotInputs
} from "/build/_shared/chunk-6NMOG26R.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import {
  require_verification_server
} from "/build/_shared/chunk-PIFLCODP.js";
import {
  require_toast_server
} from "/build/_shared/chunk-O7MTR2WV.js";
import {
  EmailSchema,
  PasswordSchema
} from "/build/_shared/chunk-N6XLTTDF.js";
import {
  require_auth_server
} from "/build/_shared/chunk-44XOYWRB.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  getFormProps,
  getInputProps,
  getZodConstraint,
  parseWithZod,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import {
  require_jsx_runtime
} from "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  EnvelopeClosedIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/litefs.server.ts
var require_litefs_server = __commonJS({
  "empty-module:#app/utils/litefs.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:#app/utils/totp.server.ts
var require_totp_server = __commonJS({
  "empty-module:#app/utils/totp.server.ts"(exports, module) {
    module.exports = {};
  }
});

// empty-module:#app/utils/email.server.ts
var require_email_server = __commonJS({
  "empty-module:#app/utils/email.server.ts"(exports, module) {
    module.exports = {};
  }
});

// node_modules/@react-email/container/dist/index.mjs
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var Container = (_a) => {
  var _b = _a, {
    children,
    style
  } = _b, props = __objRest(_b, [
    "children",
    "style"
  ]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "table",
    __spreadProps(__spreadValues({
      align: "center",
      width: "100%"
    }, props), {
      border: 0,
      cellPadding: "0",
      cellSpacing: "0",
      role: "presentation",
      style: __spreadValues({ maxWidth: "37.5em" }, style),
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { style: { width: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children }) }) })
    })
  );
};

// node_modules/@react-email/html/dist/index.mjs
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
var __defProp2 = Object.defineProperty;
var __defProps2 = Object.defineProperties;
var __getOwnPropDescs2 = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols2 = Object.getOwnPropertySymbols;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __propIsEnum2 = Object.prototype.propertyIsEnumerable;
var __defNormalProp2 = (obj, key, value) => key in obj ? __defProp2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues2 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp2.call(b, prop))
      __defNormalProp2(a, prop, b[prop]);
  if (__getOwnPropSymbols2)
    for (var prop of __getOwnPropSymbols2(b)) {
      if (__propIsEnum2.call(b, prop))
        __defNormalProp2(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps2 = (a, b) => __defProps2(a, __getOwnPropDescs2(b));
var __objRest2 = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp2.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols2)
    for (var prop of __getOwnPropSymbols2(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum2.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var Html = (_a) => {
  var _b = _a, {
    children,
    lang = "en",
    dir = "ltr"
  } = _b, props = __objRest2(_b, [
    "children",
    "lang",
    "dir"
  ]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("html", __spreadProps2(__spreadValues2({}, props), { dir, lang, children }));
};

// node_modules/@react-email/link/dist/index.mjs
var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
var __defProp3 = Object.defineProperty;
var __defProps3 = Object.defineProperties;
var __getOwnPropDescs3 = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols3 = Object.getOwnPropertySymbols;
var __hasOwnProp3 = Object.prototype.hasOwnProperty;
var __propIsEnum3 = Object.prototype.propertyIsEnumerable;
var __defNormalProp3 = (obj, key, value) => key in obj ? __defProp3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues3 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp3.call(b, prop))
      __defNormalProp3(a, prop, b[prop]);
  if (__getOwnPropSymbols3)
    for (var prop of __getOwnPropSymbols3(b)) {
      if (__propIsEnum3.call(b, prop))
        __defNormalProp3(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps3 = (a, b) => __defProps3(a, __getOwnPropDescs3(b));
var __objRest3 = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp3.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols3)
    for (var prop of __getOwnPropSymbols3(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum3.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var Link2 = (_a) => {
  var _b = _a, {
    target = "_blank",
    style
  } = _b, props = __objRest3(_b, [
    "target",
    "style"
  ]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "a",
    __spreadProps3(__spreadValues3({}, props), {
      style: __spreadValues3({
        color: "#067df7",
        textDecoration: "none"
      }, style),
      target,
      children: props.children
    })
  );
};

// node_modules/@react-email/text/dist/index.mjs
var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
var __defProp4 = Object.defineProperty;
var __defProps4 = Object.defineProperties;
var __getOwnPropDescs4 = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols4 = Object.getOwnPropertySymbols;
var __hasOwnProp4 = Object.prototype.hasOwnProperty;
var __propIsEnum4 = Object.prototype.propertyIsEnumerable;
var __defNormalProp4 = (obj, key, value) => key in obj ? __defProp4(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues4 = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp4.call(b, prop))
      __defNormalProp4(a, prop, b[prop]);
  if (__getOwnPropSymbols4)
    for (var prop of __getOwnPropSymbols4(b)) {
      if (__propIsEnum4.call(b, prop))
        __defNormalProp4(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps4 = (a, b) => __defProps4(a, __getOwnPropDescs4(b));
var __objRest4 = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp4.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols4)
    for (var prop of __getOwnPropSymbols4(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum4.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var Text = (_a) => {
  var _b = _a, { style } = _b, props = __objRest4(_b, ["style"]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "p",
    __spreadProps4(__spreadValues4({}, props), {
      style: __spreadValues4({
        fontSize: "14px",
        lineHeight: "24px",
        margin: "16px 0"
      }, style)
    })
  );
};

// app/routes/app.profile.change-email/route.tsx
var import_node3 = __toESM(require_node(), 1);

// app/routes/_auth+/verify.tsx
var import_node2 = __toESM(require_node(), 1);
var import_auth_server2 = __toESM(require_auth_server(), 1);
var import_csrf_server2 = __toESM(require_csrf_server(), 1);
var import_db_server2 = __toESM(require_db_server(), 1);
var import_honeypot_server2 = __toESM(require_honeypot_server(), 1);
var import_litefs_server = __toESM(require_litefs_server(), 1);
var import_toast_server2 = __toESM(require_toast_server(), 1);
var import_totp_server = __toESM(require_totp_server(), 1);

// app/routes/_auth+/login.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_honeypot_server = __toESM(require_honeypot_server(), 1);
var import_session_server = __toESM(require_session_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_verification_server = __toESM(require_verification_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/login.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/login.tsx"
  );
  import.meta.hot.lastModified = "1709234539877.3972";
}
var LoginFormSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  redirectTo: z.string().optional(),
  remember: z.boolean().optional()
});
function LoginPage() {
  _s();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const theme = useTheme();
  const [form, fields] = useForm({
    id: "login-form",
    constraint: getZodConstraint(LoginFormSchema),
    defaultValue: {
      redirectTo,
      remember: false,
      email: "",
      password: ""
    },
    lastResult: actionData,
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto w-full max-w-md pt-20", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-3 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("img", { src: theme === "dark" ? "/img/yawp_white_logo.png" : "/img/yawp_black_logo.png", alt: "Logo on white background", className: "mx-auto mb-10 h-auto w-80 rounded object-cover" }, void 0, false, {
        fileName: "app/routes/_auth+/login.tsx",
        lineNumber: 242,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: "Welcome back!" }, void 0, false, {
        fileName: "app/routes/_auth+/login.tsx",
        lineNumber: 243,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "Please enter your details." }, void 0, false, {
        fileName: "app/routes/_auth+/login.tsx",
        lineNumber: 244,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/login.tsx",
      lineNumber: 241,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto mt-10 w-full max-w-md px-8", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 249,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(HoneypotInputs, {}, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 250,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
          children: "Email"
        }, inputProps: {
          ...getInputProps(fields.email, {
            type: "text"
          }),
          autoFocus: true,
          className: "lowercase",
          autoComplete: "email",
          type: "email"
        }, errors: fields.email.errors }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 251,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
          children: "Password"
        }, inputProps: {
          ...getInputProps(fields.password, {
            type: "password"
          }),
          autoComplete: "current-password"
        }, errors: fields.password.errors, className: "mt-2" }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 262,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mt-4 flex items-center justify-between", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormCheckbox, { field: fields.remember, labelProps: {
            htmlFor: fields.remember.id,
            children: "Remember me"
          }, buttonProps: getInputProps(fields.remember, {
            type: "checkbox"
          }), errors: fields.remember.errors }, void 0, false, {
            fileName: "app/routes/_auth+/login.tsx",
            lineNumber: 272,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/forgot-password", className: button({
            variant: "link"
          }), children: "Forgot password?" }, void 0, false, {
            fileName: "app/routes/_auth+/login.tsx",
            lineNumber: 278,
            columnNumber: 8
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 271,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...getInputProps(fields.redirectTo, {
          type: "hidden"
        }) }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 285,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 288,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between gap-6 pt-3", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { className: "w-full", type: "submit", isLoading: isPending, children: "Log in" }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 291,
          columnNumber: 8
        }, this) }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 290,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/login.tsx",
        lineNumber: 248,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-center gap-2 pt-6", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { children: "New here?" }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 297,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { className: button({
          variant: "link"
        }), to: redirectTo ? `/signup?${encodeURIComponent(redirectTo)}` : "/signup", children: "Create an account" }, void 0, false, {
          fileName: "app/routes/_auth+/login.tsx",
          lineNumber: 298,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/login.tsx",
        lineNumber: 296,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/login.tsx",
      lineNumber: 247,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/login.tsx",
      lineNumber: 246,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/login.tsx",
    lineNumber: 240,
    columnNumber: 10
  }, this);
}
_s(LoginPage, "qzypmOBPIyDdRT6C6UDJy3FSU0M=", false, function() {
  return [useActionData, useIsPending, useSearchParams, useTheme, useForm];
});
_c = LoginPage;
var meta = () => {
  return [{
    title: "Login to Yawp!"
  }];
};
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/_auth+/login.tsx",
    lineNumber: 318,
    columnNumber: 10
  }, this);
}
_c2 = ErrorBoundary;
var _c;
var _c2;
$RefreshReg$(_c, "LoginPage");
$RefreshReg$(_c2, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/_auth+/verify.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/verify.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/verify.tsx"
  );
  import.meta.hot.lastModified = "1709234561846.9639";
}
var codeQueryParam = "code";
var targetQueryParam = "target";
var typeQueryParam = "type";
var redirectToQueryParam = "redirectTo";
var types = ["onboarding", "reset-password", "change-email", "2fa", "teacher-onboarding"];
var VerificationTypeSchema = z.enum(types);
var VerifySchema = z.object({
  [codeQueryParam]: z.string().min(6).max(6),
  [typeQueryParam]: VerificationTypeSchema,
  [targetQueryParam]: z.string(),
  [redirectToQueryParam]: z.string().optional()
});
function VerifyRoute() {
  _s2();
  const [searchParams] = useSearchParams();
  const isPending = useIsPending();
  const actionData = useActionData();
  const parsedType = VerificationTypeSchema.safeParse(searchParams.get(typeQueryParam));
  const type = parsedType.success ? parsedType.data : null;
  const checkEmail = /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_jsx_dev_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h1", { className: "text-h1", children: "Check your email" }, void 0, false, {
      fileName: "app/routes/_auth+/verify.tsx",
      lineNumber: 274,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "text-body-md mt-3 text-muted-foreground", children: "We've sent you a code to verify your email address." }, void 0, false, {
      fileName: "app/routes/_auth+/verify.tsx",
      lineNumber: 275,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/verify.tsx",
    lineNumber: 273,
    columnNumber: 22
  }, this);
  const headings = {
    onboarding: checkEmail,
    "teacher-onboarding": checkEmail,
    "reset-password": checkEmail,
    "change-email": checkEmail,
    "2fa": /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(import_jsx_dev_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("h1", { className: "text-h1", children: "Check your 2FA app" }, void 0, false, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 285,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "text-body-md mt-3 text-muted-foreground", children: "Please enter your 2FA code to verify your identity." }, void 0, false, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 286,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/verify.tsx",
      lineNumber: 284,
      columnNumber: 12
    }, this)
  };
  const [form, fields] = useForm({
    id: "verify-form",
    constraint: getZodConstraint(VerifySchema),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: VerifySchema
      });
    },
    defaultValue: {
      code: searchParams.get(codeQueryParam) ?? "",
      type,
      target: searchParams.get(targetQueryParam) ?? "",
      redirectTo: searchParams.get(redirectToQueryParam) ?? ""
    }
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("main", { className: "mx-auto w-full max-w-[400px] pt-20", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { children: type ? headings[type] : "Invalid Verification Type" }, void 0, false, {
      fileName: "app/routes/_auth+/verify.tsx",
      lineNumber: 311,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "mt-12 flex flex-col justify-center gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 314,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 313,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex w-full gap-2 px-8", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Form, { method: "POST", ...getFormProps(form), className: "flex-1", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 318,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(HoneypotInputs, {}, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 319,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(FormInput, { labelProps: {
          htmlFor: fields[codeQueryParam].id,
          children: "Code"
        }, inputProps: {
          ...getInputProps(fields[codeQueryParam], {
            type: "text"
          }),
          autoComplete: "one-time-code"
        }, errors: fields[codeQueryParam].errors }, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 320,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("input", { ...getInputProps(fields[typeQueryParam], {
          type: "hidden"
        }) }, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 329,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("input", { ...getInputProps(fields[targetQueryParam], {
          type: "hidden"
        }) }, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 332,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("input", { ...getInputProps(fields[redirectToQueryParam], {
          type: "hidden"
        }) }, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 335,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { className: "mt-2 w-full", type: "submit", disabled: isPending, children: "Submit" }, void 0, false, {
          fileName: "app/routes/_auth+/verify.tsx",
          lineNumber: 338,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 317,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/_auth+/verify.tsx",
        lineNumber: 316,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/verify.tsx",
      lineNumber: 312,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/verify.tsx",
    lineNumber: 310,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/_auth+/verify.tsx",
    lineNumber: 309,
    columnNumber: 10
  }, this);
}
_s2(VerifyRoute, "mdQnfHSnsVqWxr+aBh52a6+GYjY=", false, function() {
  return [useSearchParams, useIsPending, useActionData, useForm];
});
_c3 = VerifyRoute;
function ErrorBoundary2() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/_auth+/verify.tsx",
    lineNumber: 352,
    columnNumber: 10
  }, this);
}
_c22 = ErrorBoundary2;
var _c3;
var _c22;
$RefreshReg$(_c3, "VerifyRoute");
$RefreshReg$(_c22, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.profile.change-email/route.tsx
var import_auth_server3 = __toESM(require_auth_server(), 1);
var import_csrf_server3 = __toESM(require_csrf_server(), 1);
var import_db_server3 = __toESM(require_db_server(), 1);
var import_email_server = __toESM(require_email_server(), 1);
var import_toast_server3 = __toESM(require_toast_server(), 1);
var import_verification_server2 = __toESM(require_verification_server(), 1);
var import_jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.change-email/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.change-email/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758182.9124";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Link, { to: "/app/profile/change-email", className: button({
    variant: "ghost",
    size: "sm"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(EnvelopeClosedIcon, { className: "mr-2" }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 46,
      columnNumber: 4
    }, this),
    " Change email"
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 42,
    columnNumber: 15
  }, this)
};
var ChangeEmailSchema = z.object({
  email: EmailSchema
});
function EmailChangeEmail({
  verifyUrl,
  otp
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Html, { lang: "en", dir: "ltr", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Container, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h1", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: "Yawp! Email Change" }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 198,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 197,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: [
      "Here's your verification code: ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("strong", { children: otp }, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 202,
        columnNumber: 38
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 201,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 200,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: "Or click the link:" }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 206,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 205,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Link2, { href: verifyUrl, children: verifyUrl }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 208,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 196,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 195,
    columnNumber: 10
  }, this);
}
_c4 = EmailChangeEmail;
function EmailChangeNoticeEmail({
  userId
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Html, { lang: "en", dir: "ltr", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Container, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h1", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: "Your Yawp! email has been changed" }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 219,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 218,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: "We're writing to let you know that your Yawp! email has been changed." }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 222,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 221,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: "If you changed your email address, then you can safely ignore this. But if you did not change your email address, then please contact support immediately." }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 228,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 227,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Text, { children: [
      "Your Account ID: ",
      userId
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 235,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 234,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 217,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 216,
    columnNumber: 10
  }, this);
}
_c23 = EmailChangeNoticeEmail;
function ChangeEmailIndex() {
  _s3();
  const data = useLoaderData();
  const actionData = useActionData();
  const [form, fields] = useForm({
    id: "change-email-form",
    constraint: getZodConstraint(ChangeEmailSchema),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: ChangeEmailSchema
      });
    }
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h2", { children: "Change Email" }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 258,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { className: "mt-2", children: [
      "You will receive an email at the new email address to confirm. An email notice will also be sent to your old address",
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("strong", { children: data.user.email }, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 262,
        columnNumber: 5
      }, this),
      "."
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 259,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "mt-5", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Form, { method: "POST", ...getFormProps(form), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 266,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
        children: "New Email"
      }, inputProps: {
        ...getInputProps(fields.email, {
          type: "email"
        }),
        autoComplete: "email"
      }, className: "max-w-sm", errors: fields.email.errors }, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 267,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(ErrorList, { id: form.errorId, errors: form.errors }, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 275,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Button, { className: "mt-2", type: "submit", children: "Send Confirmation" }, void 0, false, {
        fileName: "app/routes/app.profile.change-email/route.tsx",
        lineNumber: 276,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 265,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.profile.change-email/route.tsx",
      lineNumber: 264,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.change-email/route.tsx",
    lineNumber: 257,
    columnNumber: 10
  }, this);
}
_s3(ChangeEmailIndex, "uhN6ZOxY6ejZIv5+wR5MaivwrcU=", false, function() {
  return [useLoaderData, useActionData, useForm];
});
_c32 = ChangeEmailIndex;
var _c4;
var _c23;
var _c32;
$RefreshReg$(_c4, "EmailChangeEmail");
$RefreshReg$(_c23, "EmailChangeNoticeEmail");
$RefreshReg$(_c32, "ChangeEmailIndex");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  Container,
  Html,
  Link2 as Link,
  Text,
  require_email_server,
  handle,
  ChangeEmailIndex,
  require_totp_server,
  LoginPage,
  meta,
  ErrorBoundary,
  VerifyRoute,
  ErrorBoundary2
};
//# sourceMappingURL=/build/_shared/chunk-U4YQU6YB.js.map
