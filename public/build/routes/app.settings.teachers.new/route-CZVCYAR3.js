import {
  require_toast
} from "/build/_shared/chunk-H7EWDU7D.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  Container,
  Html,
  Link,
  Text
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
import "/build/_shared/chunk-YBPZLMI7.js";
import "/build/_shared/chunk-6NMOG26R.js";
import "/build/_shared/chunk-6LMWWETO.js";
import "/build/_shared/chunk-ZTUVGTC6.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import "/build/_shared/chunk-FSP6GK2P.js";
import "/build/_shared/chunk-PIFLCODP.js";
import "/build/_shared/chunk-O7MTR2WV.js";
import "/build/_shared/chunk-N6XLTTDF.js";
import "/build/_shared/chunk-44XOYWRB.js";
import {
  FormInput
} from "/build/_shared/chunk-U5WCUP6I.js";
import "/build/_shared/chunk-FOFHSXAQ.js";
import "/build/_shared/chunk-TATQ6JRM.js";
import "/build/_shared/chunk-2IBZX4VF.js";
import "/build/_shared/chunk-36KFBUOH.js";
import {
  getFormProps,
  getInputProps,
  getZodConstraint,
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
  useActionData
} from "/build/_shared/chunk-RGUMUN57.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import "/build/_shared/chunk-UWV35TSL.js";
import "/build/_shared/chunk-GIAAE3CH.js";
import "/build/_shared/chunk-BOXFZXVX.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/email.server
var require_email = __commonJS({
  "empty-module:#app/utils/email.server"(exports, module) {
    module.exports = {};
  }
});

// app/routes/app.settings.teachers.new/route.tsx
var import_node = __toESM(require_node(), 1);
var import_db = __toESM(require_db(), 1);
var import_email = __toESM(require_email(), 1);
var import_toast = __toESM(require_toast(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.teachers.new/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.teachers.new/route.tsx"
  );
  import.meta.hot.lastModified = "1708316646010.1157";
}
var Schema = z.object({
  email: z.string()
});
function InvitationEmail({
  url
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Html, { lang: "en", dir: "ltr", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Container, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("h1", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Text, { children: "Welcome to Yawp!" }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 46,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 45,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Text, { children: "You've been invited to join Yawp! as a teacher. To get started, click the link below." }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 49,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 48,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { href: url, children: url }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 54,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.teachers.new/route.tsx",
    lineNumber: 44,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.settings.teachers.new/route.tsx",
    lineNumber: 43,
    columnNumber: 10
  }, this);
}
_c = InvitationEmail;
function Route() {
  _s();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: "new-teacher-form",
    lastResult: actionData,
    constraint: getZodConstraint(Schema)
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { ...getFormProps(form), method: "POST", className: "flex h-full max-h-[calc(100vh-70px)] flex-col justify-start gap-4 overflow-y-scroll p-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(FormInput, { inputProps: {
      ...getInputProps(fields.email, {
        type: "email"
      }),
      placeholder: "email@example.com",
      required: true,
      className: "max-w-[400px]"
    }, labelProps: {
      children: "Email"
    }, errors: fields.email.errors }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 171,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-sm text-muted-foreground", children: "Students can be added once the teacher has been created and the user exists or has accepted the invitation." }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 181,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "submit", isLoading: isPending, className: "max-w-fit", children: "Create" }, void 0, false, {
      fileName: "app/routes/app.settings.teachers.new/route.tsx",
      lineNumber: 185,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.teachers.new/route.tsx",
    lineNumber: 170,
    columnNumber: 10
  }, this);
}
_s(Route, "qg6D+LQiyyBwoKKZlQs9OeApyZ8=", false, function() {
  return [useActionData, useIsPending, useForm];
});
_c2 = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.settings.teachers.new/route.tsx",
    lineNumber: 195,
    columnNumber: 10
  }, this);
}
_c3 = ErrorBoundary;
var _c;
var _c2;
var _c3;
$RefreshReg$(_c, "InvitationEmail");
$RefreshReg$(_c2, "Route");
$RefreshReg$(_c3, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route as default
};
//# sourceMappingURL=/build/routes/app.settings.teachers.new/route-CZVCYAR3.js.map
