import "/build/_shared/chunk-VPD4J5DL.js";
import {
  require_csrf_server
} from "/build/_shared/chunk-YBPZLMI7.js";
import {
  AuthenticityTokenInput
} from "/build/_shared/chunk-6LMWWETO.js";
import {
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
import {
  require_auth_server
} from "/build/_shared/chunk-44XOYWRB.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
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
  Button,
  button
} from "/build/_shared/chunk-YMX4THL4.js";
import "/build/_shared/chunk-4ODUPV53.js";
import {
  CameraIcon,
  ResetIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  getUserImgSrc,
  useDoubleCheck,
  useIsPending
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  Link,
  useActionData,
  useLoaderData
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

// app/routes/app.profile.photo/route.tsx
var import_node = __toESM(require_node(), 1);
var import_react3 = __toESM(require_react(), 1);
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.profile.photo/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.profile.photo/route.tsx"
  );
  import.meta.hot.lastModified = "1709234758172.6443";
}
var handle = {
  breadcrumb: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Link, { to: "/app/profile/two-factor", className: button({
    variant: "ghost",
    size: "sm"
  }), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(CameraIcon, { className: "mr-2" }, void 0, false, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 42,
      columnNumber: 4
    }, this),
    " Photo"
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.photo/route.tsx",
    lineNumber: 38,
    columnNumber: 15
  }, this)
};
var MAX_SIZE = 1024 * 1024 * 3;
var DeleteImageSchema = z.object({
  intent: z.literal("delete")
});
var NewImageSchema = z.object({
  intent: z.literal("submit"),
  photoFile: z.instanceof(File).refine((file) => file.size > 0, "Image is required").refine((file) => file.size <= MAX_SIZE, "Image size must be less than 3MB")
});
var PhotoFormSchema = z.union([DeleteImageSchema, NewImageSchema]);
function PhotoRoute() {
  _s();
  const data = useLoaderData();
  const doubleCheckDeleteImage = useDoubleCheck();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [newImageSrc, setNewImageSrc] = (0, import_react3.useState)(null);
  const [form, fields] = useForm({
    id: "profile-photo",
    constraint: getZodConstraint(PhotoFormSchema),
    lastResult: actionData,
    shouldRevalidate: "onBlur"
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Form, { method: "POST", encType: "multipart/form-data", className: "flex gap-10", onReset: () => setNewImageSrc(null), ...getFormProps(form), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 156,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("img", { src: newImageSrc ?? (data.user ? getUserImgSrc(data.user.image?.id) : ""), className: "h-48 w-48 rounded-full object-cover", alt: data.user?.name ?? data.user?.email }, void 0, false, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 157,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: fields.photoFile.errors, id: fields.photoFile.id }, void 0, false, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 158,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: "flex flex-col justify-center gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("input", { ...getInputProps(fields.photoFile, {
        type: "file"
      }), accept: "image/*", className: "peer sr-only", required: true, tabIndex: newImageSrc ? -1 : 0, onChange: (e) => {
        const file = e.currentTarget.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setNewImageSrc(event.target?.result?.toString() ?? null);
          };
          reader.readAsDataURL(file);
        }
      } }, void 0, false, {
        fileName: "app/routes/app.profile.photo/route.tsx",
        lineNumber: 166,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("label", { htmlFor: fields.photoFile.id, className: button({
        className: "cursor-pointer"
      }), children: "Change" }, void 0, false, {
        fileName: "app/routes/app.profile.photo/route.tsx",
        lineNumber: 178,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { name: "intent", value: "submit", type: "submit", className: "peer-invalid:hidden", isLoading: isPending, children: "Save Photo" }, void 0, false, {
        fileName: "app/routes/app.profile.photo/route.tsx",
        lineNumber: 183,
        columnNumber: 6
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { type: "reset", className: "peer-invalid:hidden", variant: "secondary", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ResetIcon, { className: "mr-2" }, void 0, false, {
          fileName: "app/routes/app.profile.photo/route.tsx",
          lineNumber: 187,
          columnNumber: 7
        }, this),
        "Reset"
      ] }, void 0, true, {
        fileName: "app/routes/app.profile.photo/route.tsx",
        lineNumber: 186,
        columnNumber: 6
      }, this),
      data.user.image?.id ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Button, { variant: "destructive", className: "peer-valid:hidden", ...doubleCheckDeleteImage.getButtonProps({
        type: "submit",
        name: "intent",
        value: "delete"
      }), children: doubleCheckDeleteImage.doubleCheck ? "Are you sure?" : "Delete" }, void 0, false, {
        fileName: "app/routes/app.profile.photo/route.tsx",
        lineNumber: 190,
        columnNumber: 29
      }, this) : null
    ] }, void 0, true, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 159,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { errors: form.errors }, void 0, false, {
      fileName: "app/routes/app.profile.photo/route.tsx",
      lineNumber: 198,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.profile.photo/route.tsx",
    lineNumber: 155,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.profile.photo/route.tsx",
    lineNumber: 154,
    columnNumber: 10
  }, this);
}
_s(PhotoRoute, "GuFx3Ukp38TFJXuMzYfahRGlA9w=", false, function() {
  return [useLoaderData, useDoubleCheck, useActionData, useIsPending, useForm];
});
_c = PhotoRoute;
var _c;
$RefreshReg$(_c, "PhotoRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  PhotoRoute as default,
  handle
};
//# sourceMappingURL=/build/routes/app.profile.photo/route-WTQDSN7R.js.map
