import {
  Container,
  Html,
  Link as Link2,
  Text,
  require_email_server
} from "/build/_shared/chunk-U4YQU6YB.js";
import "/build/_shared/chunk-3L2ZJ3AV.js";
import "/build/_shared/chunk-KDBKE6RH.js";
import "/build/_shared/chunk-VOZB6DJP.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import "/build/_shared/chunk-5PDURZFB.js";
import "/build/_shared/chunk-DXKYUF2Y.js";
import "/build/_shared/chunk-L5QMVKXR.js";
import {
  require_honeypot_server
} from "/build/_shared/chunk-32WNH7JC.js";
import "/build/_shared/chunk-XFJ7VQR3.js";
import "/build/_shared/chunk-SAJ3AEKV.js";
import {
  require_csrf_server
} from "/build/_shared/chunk-YBPZLMI7.js";
import {
  HoneypotInputs
} from "/build/_shared/chunk-6NMOG26R.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
import "/build/_shared/chunk-ZTUVGTC6.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import "/build/_shared/chunk-PIFLCODP.js";
import "/build/_shared/chunk-O7MTR2WV.js";
import {
  EmailSchema
} from "/build/_shared/chunk-N6XLTTDF.js";
import "/build/_shared/chunk-44XOYWRB.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  getFormProps,
  getInputProps,
  getZodConstraint,
  parseWithZod,
  useForm
} from "/build/_shared/chunk-I6VWVMMK.js";
import "/build/_shared/chunk-NMZL6IDN.js";
import {
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import "/build/_shared/chunk-2IBK7TCH.js";
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
  useActionData
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

// app/routes/_auth+/signup.tsx
var import_node = __toESM(require_node(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_email_server = __toESM(require_email_server(), 1);
var import_honeypot_server = __toESM(require_honeypot_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/signup.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/signup.tsx"
  );
  import.meta.hot.lastModified = "1708316645857.5615";
}
var SignupSchema = z.object({
  email: EmailSchema
});
function SignupEmail({
  onboardingUrl,
  otp
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Html, { lang: "en", dir: "ltr", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Container, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Text, { children: "Welcome to Yawp!" }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 111,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 110,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Text, { children: [
      "Here's your verification code: ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("strong", { children: otp }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 115,
        columnNumber: 38
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 114,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 113,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Text, { children: "Or click the link to get started:" }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 119,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 118,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link2, { href: onboardingUrl, children: onboardingUrl }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 121,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/signup.tsx",
    lineNumber: 109,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/_auth+/signup.tsx",
    lineNumber: 108,
    columnNumber: 10
  }, this);
}
_c = SignupEmail;
var meta = () => {
  return [{
    title: "Sign Up | Yawp!"
  }];
};
function SignupRoute() {
  _s();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: "signup-form",
    constraint: getZodConstraint(SignupSchema),
    lastResult: actionData,
    onValidate({
      formData
    }) {
      const result = parseWithZod(formData, {
        schema: SignupSchema
      });
      return result;
    },
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto w-full max-w-md pt-20", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col gap-3 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: "Let's get started!" }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 151,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-body-md mt-3 text-muted-foreground", children: "Please enter your email." }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 152,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 150,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "mx-auto mt-16 min-w-full max-w-sm px-8 sm:min-w-[368px]", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", ...getFormProps(form), className: "flex flex-col gap-4", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 158,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(HoneypotInputs, {}, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 159,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.email.id,
        children: "Email"
      }, inputProps: {
        ...getInputProps(fields.email, {
          type: "email"
        }),
        autoFocus: true,
        autoComplete: "email"
      }, errors: fields.email.errors }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 160,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 170,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { className: "w-full", type: "submit", disabled: isPending, children: "Submit" }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 171,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { variant: "link", asChild: true, className: "mx-auto mt-2 w-full", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/login", children: "Already have an account?" }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 175,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/_auth+/signup.tsx",
        lineNumber: 174,
        columnNumber: 6
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 157,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/_auth+/signup.tsx",
      lineNumber: 156,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/signup.tsx",
    lineNumber: 149,
    columnNumber: 10
  }, this);
}
_s(SignupRoute, "qg6D+LQiyyBwoKKZlQs9OeApyZ8=", false, function() {
  return [useActionData, useIsPending, useForm];
});
_c2 = SignupRoute;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/_auth+/signup.tsx",
    lineNumber: 186,
    columnNumber: 10
  }, this);
}
_c3 = ErrorBoundary;
var _c;
var _c2;
var _c3;
$RefreshReg$(_c, "SignupEmail");
$RefreshReg$(_c2, "SignupRoute");
$RefreshReg$(_c3, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  SignupRoute as default,
  meta
};
//# sourceMappingURL=/build/routes/_auth+/signup-H6GOHIZ4.js.map
