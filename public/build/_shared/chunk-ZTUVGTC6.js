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
  PasswordAndConfirmPasswordSchema
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
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
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
  useActionData,
  useLoaderData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/_auth+/reset-password.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_verification_server = __toESM(require_verification_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/reset-password.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/reset-password.tsx"
  );
  import.meta.hot.lastModified = "1708316645857.3188";
}
var ResetPasswordSchema = PasswordAndConfirmPasswordSchema;
var meta = () => {
  return [{
    title: "Reset Password | Yawp!"
  }];
};
function ResetPasswordPage() {
  _s();
  const data = useLoaderData();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: "reset-password",
    constraint: getZodConstraint(ResetPasswordSchema),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: ResetPasswordSchema
      });
    },
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "container flex flex-col justify-center pb-32 pt-20", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "text-center", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { className: "text-h1", children: "Password Reset" }, void 0, false, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 143,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-body-md mt-3 text-muted-foreground", children: [
        "Hi, ",
        data.resetPasswordEmail,
        ". No worries. It happens all the time."
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 144,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/reset-password.tsx",
      lineNumber: 142,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto mt-16 min-w-full max-w-sm px-8 sm:min-w-[368px]", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.password.id,
        children: "New Password"
      }, inputProps: {
        ...getInputProps(fields.password, {
          type: "password"
        }),
        autoComplete: "new-password",
        autoFocus: true
      }, errors: fields.password.errors }, void 0, false, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 150,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.confirmPassword.id,
        children: "Confirm Password"
      }, inputProps: {
        ...getInputProps(fields.confirmPassword, {
          type: "password"
        }),
        autoComplete: "new-password"
      }, errors: fields.confirmPassword.errors }, void 0, false, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 160,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 170,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { className: "w-full", type: "submit", disabled: isPending, children: "Reset password" }, void 0, false, {
        fileName: "app/routes/_auth+/reset-password.tsx",
        lineNumber: 172,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/reset-password.tsx",
      lineNumber: 149,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/reset-password.tsx",
      lineNumber: 148,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/reset-password.tsx",
    lineNumber: 141,
    columnNumber: 10
  }, this);
}
_s(ResetPasswordPage, "LlpdpXx3F0DiRi9p4RwyMUO3ZDI=", false, function() {
  return [useLoaderData, useActionData, useIsPending, useForm];
});
_c = ResetPasswordPage;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/_auth+/reset-password.tsx",
    lineNumber: 184,
    columnNumber: 10
  }, this);
}
_c2 = ErrorBoundary;
var _c;
var _c2;
$RefreshReg$(_c, "ResetPasswordPage");
$RefreshReg$(_c2, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  meta,
  ResetPasswordPage,
  ErrorBoundary
};
//# sourceMappingURL=/build/_shared/chunk-ZTUVGTC6.js.map
