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
  require_verification_server
} from "/build/_shared/chunk-PIFLCODP.js";
import {
  require_toast_server
} from "/build/_shared/chunk-O7MTR2WV.js";
import {
  NameSchema,
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
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
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
  useLoaderData,
  useSearchParams
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/_auth+/teacher-onboarding.tsx
var import_node = __toESM(require_node(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
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
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/teacher-onboarding.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/teacher-onboarding.tsx"
  );
  import.meta.hot.lastModified = "1708316645857.6926";
}
var SignupFormSchema = z.object({
  name: NameSchema,
  remember: z.boolean().optional(),
  redirectTo: z.string().optional()
}).and(PasswordAndConfirmPasswordSchema);
_c = SignupFormSchema;
var meta = () => {
  return [{
    title: "Setup Yawp! Account"
  }];
};
function SignupRoute() {
  _s();
  const data = useLoaderData();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const [form, fields] = useForm({
    id: "teacher-onboarding-form",
    constraint: getZodConstraint(SignupFormSchema),
    defaultValue: {
      redirectTo
    },
    lastResult: actionData,
    onValidate({
      formData
    }) {
      return parseWithZod(formData, {
        schema: SignupFormSchema
      });
    },
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto w-full max-w-md px-2 py-20", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-3 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: [
        "Welcome, ",
        data.email,
        "!"
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 159,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: "Please enter your details." }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 160,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/teacher-onboarding.tsx",
      lineNumber: 158,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", className: "mx-auto mt-20 flex min-w-full max-w-sm flex-col gap-3 px-8 sm:min-w-[368px]", ...getFormProps(form), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 163,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(HoneypotInputs, {}, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 164,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.name.id,
        children: "Name"
      }, inputProps: {
        ...getInputProps(fields.name, {
          type: "text"
        }),
        autoComplete: "name"
      }, errors: fields.name.errors }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 165,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.password.id,
        children: "Password"
      }, inputProps: {
        ...getInputProps(fields.password, {
          type: "password"
        }),
        autoComplete: "new-password"
      }, errors: fields.password.errors }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 174,
        columnNumber: 5
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
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 184,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormCheckbox, { field: fields.remember, labelProps: {
        htmlFor: fields.remember.id,
        children: "Remember me"
      }, buttonProps: getInputProps(fields.remember, {
        type: "checkbox"
      }), errors: fields.remember.errors }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 194,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...getInputProps(fields.redirectTo, {
        type: "hidden"
      }) }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 201,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 204,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex items-center justify-between gap-6", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { className: "mt-4 w-full", type: "submit", disabled: isPending, children: "Create an account" }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 207,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/_auth+/teacher-onboarding.tsx",
        lineNumber: 206,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/teacher-onboarding.tsx",
      lineNumber: 162,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/teacher-onboarding.tsx",
    lineNumber: 157,
    columnNumber: 10
  }, this);
}
_s(SignupRoute, "SbEzVWUNyTwM/qcAIjF6pChQLW8=", false, function() {
  return [useLoaderData, useActionData, useIsPending, useSearchParams, useForm];
});
_c2 = SignupRoute;
var _c;
var _c2;
$RefreshReg$(_c, "SignupFormSchema");
$RefreshReg$(_c2, "SignupRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  meta,
  SignupRoute
};
//# sourceMappingURL=/build/_shared/chunk-KDBKE6RH.js.map
