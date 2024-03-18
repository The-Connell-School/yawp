import {
  $010c2913dbd2fe3d$export$5cae361ad82dce8b
} from "/build/_shared/chunk-XFJ7VQR3.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  $db6c3485150b8e66$export$1ab7ae714698c4b8
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  $71cd76cc60e0454e$export$6f32135080cb4c3,
  $8927f6f2acc4f386$export$250ffa63cdc0d034,
  $921a889cee6df7e8$export$99c2b779aa4e8b8b,
  $c512c27ab02ef895$export$50c7b4e9d9f19c1,
  $e42e1063c40fb3ef$export$b9ecd428b558ff10
} from "/build/_shared/chunk-36KFBUOH.js";
import {
  useInputControl
} from "/build/_shared/chunk-I6VWVMMK.js";
import {
  Check
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  $6ed0406888f73fc4$export$c7b2cbe3552a0d05,
  _extends
} from "/build/_shared/chunk-4ODUPV53.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __commonJS,
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// empty-module:#app/utils/honeypot.server.ts
var require_honeypot_server = __commonJS({
  "empty-module:#app/utils/honeypot.server.ts"(exports, module) {
    module.exports = {};
  }
});

// app/components/forms/form-checkbox.tsx
var import_react3 = __toESM(require_react(), 1);

// node_modules/@radix-ui/react-checkbox/dist/index.mjs
var import_react = __toESM(require_react(), 1);
var $e698a72e93240346$var$CHECKBOX_NAME = "Checkbox";
var [$e698a72e93240346$var$createCheckboxContext, $e698a72e93240346$export$b566c4ff5488ea01] = $c512c27ab02ef895$export$50c7b4e9d9f19c1($e698a72e93240346$var$CHECKBOX_NAME);
var [$e698a72e93240346$var$CheckboxProvider, $e698a72e93240346$var$useCheckboxContext] = $e698a72e93240346$var$createCheckboxContext($e698a72e93240346$var$CHECKBOX_NAME);
var $e698a72e93240346$export$48513f6b9f8ce62d = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeCheckbox, name, checked: checkedProp, defaultChecked, required, disabled, value = "on", onCheckedChange, ...checkboxProps } = props;
  const [button, setButton] = (0, import_react.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setButton(node)
  );
  const hasConsumerStoppedPropagationRef = (0, import_react.useRef)(false);
  const isFormControl = button ? Boolean(button.closest("form")) : true;
  const [checked = false, setChecked] = $71cd76cc60e0454e$export$6f32135080cb4c3({
    prop: checkedProp,
    defaultProp: defaultChecked,
    onChange: onCheckedChange
  });
  const initialCheckedStateRef = (0, import_react.useRef)(checked);
  (0, import_react.useEffect)(() => {
    const form = button === null || button === void 0 ? void 0 : button.form;
    if (form) {
      const reset = () => setChecked(initialCheckedStateRef.current);
      form.addEventListener("reset", reset);
      return () => form.removeEventListener("reset", reset);
    }
  }, [
    button,
    setChecked
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)($e698a72e93240346$var$CheckboxProvider, {
    scope: __scopeCheckbox,
    state: checked,
    disabled
  }, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.button, _extends({
    type: "button",
    role: "checkbox",
    "aria-checked": $e698a72e93240346$var$isIndeterminate(checked) ? "mixed" : checked,
    "aria-required": required,
    "data-state": $e698a72e93240346$var$getState(checked),
    "data-disabled": disabled ? "" : void 0,
    disabled,
    value
  }, checkboxProps, {
    ref: composedRefs,
    onKeyDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(props.onKeyDown, (event) => {
      if (event.key === "Enter")
        event.preventDefault();
    }),
    onClick: $e42e1063c40fb3ef$export$b9ecd428b558ff10(props.onClick, (event) => {
      setChecked(
        (prevChecked) => $e698a72e93240346$var$isIndeterminate(prevChecked) ? true : !prevChecked
      );
      if (isFormControl) {
        hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
        if (!hasConsumerStoppedPropagationRef.current)
          event.stopPropagation();
      }
    })
  })), isFormControl && /* @__PURE__ */ (0, import_react.createElement)($e698a72e93240346$var$BubbleInput, {
    control: button,
    bubbles: !hasConsumerStoppedPropagationRef.current,
    name,
    value,
    checked,
    required,
    disabled,
    style: {
      transform: "translateX(-100%)"
    }
  }));
});
var $e698a72e93240346$var$INDICATOR_NAME = "CheckboxIndicator";
var $e698a72e93240346$export$59aad738f51d1c05 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeCheckbox, forceMount, ...indicatorProps } = props;
  const context = $e698a72e93240346$var$useCheckboxContext($e698a72e93240346$var$INDICATOR_NAME, __scopeCheckbox);
  return /* @__PURE__ */ (0, import_react.createElement)($921a889cee6df7e8$export$99c2b779aa4e8b8b, {
    present: forceMount || $e698a72e93240346$var$isIndeterminate(context.state) || context.state === true
  }, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    "data-state": $e698a72e93240346$var$getState(context.state),
    "data-disabled": context.disabled ? "" : void 0
  }, indicatorProps, {
    ref: forwardedRef,
    style: {
      pointerEvents: "none",
      ...props.style
    }
  })));
});
var $e698a72e93240346$var$BubbleInput = (props) => {
  const { control, checked, bubbles = true, ...inputProps } = props;
  const ref = (0, import_react.useRef)(null);
  const prevChecked = $010c2913dbd2fe3d$export$5cae361ad82dce8b(checked);
  const controlSize = $db6c3485150b8e66$export$1ab7ae714698c4b8(control);
  (0, import_react.useEffect)(() => {
    const input = ref.current;
    const inputProto = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(inputProto, "checked");
    const setChecked = descriptor.set;
    if (prevChecked !== checked && setChecked) {
      const event = new Event("click", {
        bubbles
      });
      input.indeterminate = $e698a72e93240346$var$isIndeterminate(checked);
      setChecked.call(input, $e698a72e93240346$var$isIndeterminate(checked) ? false : checked);
      input.dispatchEvent(event);
    }
  }, [
    prevChecked,
    checked,
    bubbles
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)("input", _extends({
    type: "checkbox",
    "aria-hidden": true,
    defaultChecked: $e698a72e93240346$var$isIndeterminate(checked) ? false : checked
  }, inputProps, {
    tabIndex: -1,
    ref,
    style: {
      ...props.style,
      ...controlSize,
      position: "absolute",
      pointerEvents: "none",
      opacity: 0,
      margin: 0
    }
  }));
};
function $e698a72e93240346$var$isIndeterminate(checked) {
  return checked === "indeterminate";
}
function $e698a72e93240346$var$getState(checked) {
  return $e698a72e93240346$var$isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
}
var $e698a72e93240346$export$be92b6f5f03c0fe9 = $e698a72e93240346$export$48513f6b9f8ce62d;
var $e698a72e93240346$export$adb584737d712b70 = $e698a72e93240346$export$59aad738f51d1c05;

// app/components/ui/checkbox.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/checkbox.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/checkbox.tsx"
  );
  import.meta.hot.lastModified = "1705527072696.37";
}
var Checkbox = React.forwardRef(_c = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($e698a72e93240346$export$be92b6f5f03c0fe9, { ref, className: cn("peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className), ...props, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($e698a72e93240346$export$adb584737d712b70, { className: cn("flex items-center justify-center text-current"), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Check, { className: "h-4 w-4" }, void 0, false, {
  fileName: "app/components/ui/checkbox.tsx",
  lineNumber: 30,
  columnNumber: 4
}, this) }, void 0, false, {
  fileName: "app/components/ui/checkbox.tsx",
  lineNumber: 29,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/checkbox.tsx",
  lineNumber: 28,
  columnNumber: 12
}, this));
_c2 = Checkbox;
Checkbox.displayName = $e698a72e93240346$export$be92b6f5f03c0fe9.displayName;
var _c;
var _c2;
$RefreshReg$(_c, "Checkbox$React.forwardRef");
$RefreshReg$(_c2, "Checkbox");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-checkbox.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-checkbox.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-checkbox.tsx"
  );
  import.meta.hot.lastModified = "1708316646006.7712";
}
function FormCheckbox({
  labelProps,
  buttonProps,
  errors,
  className,
  field
}) {
  _s();
  const fallbackId = (0, import_react3.useId)();
  const buttonRef = (0, import_react3.useRef)(null);
  const control = useInputControl(field);
  const id = buttonProps.id ?? buttonProps.name ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className, children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Checkbox, { id, ref: buttonRef, "aria-invalid": errorId ? true : void 0, "aria-describedby": errorId, ...buttonProps, onCheckedChange: (state) => {
        const value = state.valueOf() ? "on" : "off";
        control.change(value);
        buttonProps.onCheckedChange?.(state);
      }, onFocus: (event) => {
        control.focus();
        buttonProps.onFocus?.(event);
      }, onBlur: (event) => {
        control.blur();
        buttonProps.onBlur?.(event);
      }, type: "button", checked: control.value === "on" }, void 0, false, {
        fileName: "app/components/forms/form-checkbox.tsx",
        lineNumber: 41,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { htmlFor: id, ...labelProps, className: "text-body-xs mt-0.5 self-center" }, void 0, false, {
        fileName: "app/components/forms/form-checkbox.tsx",
        lineNumber: 52,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-checkbox.tsx",
      lineNumber: 40,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "min-h-2", children: errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ErrorList, { id: errorId, errors }, void 0, false, {
      fileName: "app/components/forms/form-checkbox.tsx",
      lineNumber: 55,
      columnNumber: 16
    }, this) : null }, void 0, false, {
      fileName: "app/components/forms/form-checkbox.tsx",
      lineNumber: 54,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-checkbox.tsx",
    lineNumber: 39,
    columnNumber: 10
  }, this);
}
_s(FormCheckbox, "lAR07NgB3DfZ0zxP8tEF7ctnGFA=", false, function() {
  return [import_react3.useId, useInputControl];
});
_c3 = FormCheckbox;
var _c3;
$RefreshReg$(_c3, "FormCheckbox");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  require_honeypot_server,
  FormCheckbox
};
//# sourceMappingURL=/build/_shared/chunk-32WNH7JC.js.map
