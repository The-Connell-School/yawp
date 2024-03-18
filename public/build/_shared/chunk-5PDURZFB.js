import {
  $e02a7d9cb1dc128c$export$c74125a8e3af6bb2,
  $f631663db3294ace$export$b39126d51d94e6f3
} from "/build/_shared/chunk-DXKYUF2Y.js";
import {
  $3db38b7d1fb3fe6a$export$b7ece24a22aeda8c,
  $d3863c46a17e8a28$export$20e40289641fbbb6,
  Combination_default,
  hideOthers
} from "/build/_shared/chunk-L5QMVKXR.js";
import {
  FormCheckbox,
  require_honeypot_server
} from "/build/_shared/chunk-32WNH7JC.js";
import {
  $010c2913dbd2fe3d$export$5cae361ad82dce8b
} from "/build/_shared/chunk-XFJ7VQR3.js";
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
  require_db_server
} from "/build/_shared/chunk-FSP6GK2P.js";
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
  $cf1ac5d9fe0e8206$export$722aac194ae923,
  $cf1ac5d9fe0e8206$export$7c6e2c02157bb7d2,
  $cf1ac5d9fe0e8206$export$b688253958b8dfe7,
  $cf1ac5d9fe0e8206$export$be92b6f5f03c0fe9,
  $ea1ef594cf570d83$export$439d29a4e110a164
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  $1746a345f3d73bb7$export$f680877a34711e37,
  $5cb92bef7577960e$export$177fb62ff3ec1f22,
  $71cd76cc60e0454e$export$6f32135080cb4c3,
  $8927f6f2acc4f386$export$250ffa63cdc0d034,
  $9f79659886946c16$export$e5c5a5f917a5871c,
  $b1b2314f5f9a1d84$export$25bec8c6f54ee79a,
  $c512c27ab02ef895$export$50c7b4e9d9f19c1,
  $e42e1063c40fb3ef$export$b9ecd428b558ff10,
  $f1701beae083dbae$export$602eac185826482c
} from "/build/_shared/chunk-36KFBUOH.js";
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
  Button,
  Check,
  ChevronDown,
  ChevronUp
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  $5e63c961fc1ce211$export$8c6ed5c666ac1360,
  $6ed0406888f73fc4$export$c7b2cbe3552a0d05,
  _extends
} from "/build/_shared/chunk-4ODUPV53.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn,
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
  require_react_dom
} from "/build/_shared/chunk-GIAAE3CH.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/routes/_auth+/onboarding.tsx
var import_node = __toESM(require_node(), 1);

// app/components/forms/form-select.tsx
var import_react2 = __toESM(require_react(), 1);

// node_modules/@radix-ui/react-select/dist/index.mjs
var import_react = __toESM(require_react(), 1);
var import_react_dom = __toESM(require_react_dom(), 1);

// node_modules/@radix-ui/number/dist/index.mjs
function $ae6933e535247d3d$export$7d15b64cf5a3a4c4(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}

// node_modules/@radix-ui/react-select/dist/index.mjs
var $cc7e05a45900e73f$var$OPEN_KEYS = [
  " ",
  "Enter",
  "ArrowUp",
  "ArrowDown"
];
var $cc7e05a45900e73f$var$SELECTION_KEYS = [
  " ",
  "Enter"
];
var $cc7e05a45900e73f$var$SELECT_NAME = "Select";
var [$cc7e05a45900e73f$var$Collection, $cc7e05a45900e73f$var$useCollection, $cc7e05a45900e73f$var$createCollectionScope] = $e02a7d9cb1dc128c$export$c74125a8e3af6bb2($cc7e05a45900e73f$var$SELECT_NAME);
var [$cc7e05a45900e73f$var$createSelectContext, $cc7e05a45900e73f$export$286727a75dc039bd] = $c512c27ab02ef895$export$50c7b4e9d9f19c1($cc7e05a45900e73f$var$SELECT_NAME, [
  $cc7e05a45900e73f$var$createCollectionScope,
  $cf1ac5d9fe0e8206$export$722aac194ae923
]);
var $cc7e05a45900e73f$var$usePopperScope = $cf1ac5d9fe0e8206$export$722aac194ae923();
var [$cc7e05a45900e73f$var$SelectProvider, $cc7e05a45900e73f$var$useSelectContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$SELECT_NAME);
var [$cc7e05a45900e73f$var$SelectNativeOptionsProvider, $cc7e05a45900e73f$var$useSelectNativeOptionsContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$SELECT_NAME);
var $cc7e05a45900e73f$export$ef9b1a59e592288f = (props) => {
  const { __scopeSelect, children, open: openProp, defaultOpen, onOpenChange, value: valueProp, defaultValue, onValueChange, dir, name, autoComplete, disabled, required } = props;
  const popperScope = $cc7e05a45900e73f$var$usePopperScope(__scopeSelect);
  const [trigger, setTrigger] = (0, import_react.useState)(null);
  const [valueNode, setValueNode] = (0, import_react.useState)(null);
  const [valueNodeHasChildren, setValueNodeHasChildren] = (0, import_react.useState)(false);
  const direction = $f631663db3294ace$export$b39126d51d94e6f3(dir);
  const [open = false, setOpen] = $71cd76cc60e0454e$export$6f32135080cb4c3({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange
  });
  const [value, setValue] = $71cd76cc60e0454e$export$6f32135080cb4c3({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange
  });
  const triggerPointerDownPosRef = (0, import_react.useRef)(null);
  const isFormControl = trigger ? Boolean(trigger.closest("form")) : true;
  const [nativeOptionsSet, setNativeOptionsSet] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const nativeSelectKey = Array.from(nativeOptionsSet).map(
    (option) => option.props.value
  ).join(";");
  return /* @__PURE__ */ (0, import_react.createElement)($cf1ac5d9fe0e8206$export$be92b6f5f03c0fe9, popperScope, /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectProvider, {
    required,
    scope: __scopeSelect,
    trigger,
    onTriggerChange: setTrigger,
    valueNode,
    onValueNodeChange: setValueNode,
    valueNodeHasChildren,
    onValueNodeHasChildrenChange: setValueNodeHasChildren,
    contentId: $1746a345f3d73bb7$export$f680877a34711e37(),
    value,
    onValueChange: setValue,
    open,
    onOpenChange: setOpen,
    dir: direction,
    triggerPointerDownPosRef,
    disabled
  }, /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$Collection.Provider, {
    scope: __scopeSelect
  }, /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectNativeOptionsProvider, {
    scope: props.__scopeSelect,
    onNativeOptionAdd: (0, import_react.useCallback)((option) => {
      setNativeOptionsSet(
        (prev) => new Set(prev).add(option)
      );
    }, []),
    onNativeOptionRemove: (0, import_react.useCallback)((option) => {
      setNativeOptionsSet((prev) => {
        const optionsSet = new Set(prev);
        optionsSet.delete(option);
        return optionsSet;
      });
    }, [])
  }, children)), isFormControl ? /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$BubbleSelect, {
    key: nativeSelectKey,
    "aria-hidden": true,
    required,
    tabIndex: -1,
    name,
    autoComplete,
    value,
    onChange: (event) => setValue(event.target.value),
    disabled
  }, value === void 0 ? /* @__PURE__ */ (0, import_react.createElement)("option", {
    value: ""
  }) : null, Array.from(nativeOptionsSet)) : null));
};
var $cc7e05a45900e73f$var$TRIGGER_NAME = "SelectTrigger";
var $cc7e05a45900e73f$export$3ac1e88a1c0b9f1 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, disabled = false, ...triggerProps } = props;
  const popperScope = $cc7e05a45900e73f$var$usePopperScope(__scopeSelect);
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$TRIGGER_NAME, __scopeSelect);
  const isDisabled = context.disabled || disabled;
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, context.onTriggerChange);
  const getItems = $cc7e05a45900e73f$var$useCollection(__scopeSelect);
  const [searchRef, handleTypeaheadSearch, resetTypeahead] = $cc7e05a45900e73f$var$useTypeaheadSearch((search) => {
    const enabledItems = getItems().filter(
      (item) => !item.disabled
    );
    const currentItem = enabledItems.find(
      (item) => item.value === context.value
    );
    const nextItem = $cc7e05a45900e73f$var$findNextItem(enabledItems, search, currentItem);
    if (nextItem !== void 0)
      context.onValueChange(nextItem.value);
  });
  const handleOpen = () => {
    if (!isDisabled) {
      context.onOpenChange(true);
      resetTypeahead();
    }
  };
  return /* @__PURE__ */ (0, import_react.createElement)($cf1ac5d9fe0e8206$export$b688253958b8dfe7, _extends({
    asChild: true
  }, popperScope), /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.button, _extends({
    type: "button",
    role: "combobox",
    "aria-controls": context.contentId,
    "aria-expanded": context.open,
    "aria-required": context.required,
    "aria-autocomplete": "none",
    dir: context.dir,
    "data-state": context.open ? "open" : "closed",
    disabled: isDisabled,
    "data-disabled": isDisabled ? "" : void 0,
    "data-placeholder": $cc7e05a45900e73f$var$shouldShowPlaceholder(context.value) ? "" : void 0
  }, triggerProps, {
    ref: composedRefs,
    onClick: $e42e1063c40fb3ef$export$b9ecd428b558ff10(triggerProps.onClick, (event) => {
      event.currentTarget.focus();
    }),
    onPointerDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(triggerProps.onPointerDown, (event) => {
      const target = event.target;
      if (target.hasPointerCapture(event.pointerId))
        target.releasePointerCapture(event.pointerId);
      if (event.button === 0 && event.ctrlKey === false) {
        handleOpen();
        context.triggerPointerDownPosRef.current = {
          x: Math.round(event.pageX),
          y: Math.round(event.pageY)
        };
        event.preventDefault();
      }
    }),
    onKeyDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(triggerProps.onKeyDown, (event) => {
      const isTypingAhead = searchRef.current !== "";
      const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
      if (!isModifierKey && event.key.length === 1)
        handleTypeaheadSearch(event.key);
      if (isTypingAhead && event.key === " ")
        return;
      if ($cc7e05a45900e73f$var$OPEN_KEYS.includes(event.key)) {
        handleOpen();
        event.preventDefault();
      }
    })
  })));
});
var $cc7e05a45900e73f$var$VALUE_NAME = "SelectValue";
var $cc7e05a45900e73f$export$e288731fd71264f0 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, className, style, children, placeholder = "", ...valueProps } = props;
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$VALUE_NAME, __scopeSelect);
  const { onValueNodeHasChildrenChange } = context;
  const hasChildren = children !== void 0;
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, context.onValueNodeChange);
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    onValueNodeHasChildrenChange(hasChildren);
  }, [
    onValueNodeHasChildrenChange,
    hasChildren
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({}, valueProps, {
    ref: composedRefs,
    style: {
      pointerEvents: "none"
    }
  }), $cc7e05a45900e73f$var$shouldShowPlaceholder(context.value) ? /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, placeholder) : children);
});
var $cc7e05a45900e73f$export$99b400cabb58c515 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, children, ...iconProps } = props;
  return /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    "aria-hidden": true
  }, iconProps, {
    ref: forwardedRef
  }), children || "\u25BC");
});
var $cc7e05a45900e73f$export$b2af6c9944296213 = (props) => {
  return /* @__PURE__ */ (0, import_react.createElement)($f1701beae083dbae$export$602eac185826482c, _extends({
    asChild: true
  }, props));
};
var $cc7e05a45900e73f$var$CONTENT_NAME = "SelectContent";
var $cc7e05a45900e73f$export$c973a4b3cb86a03d = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$CONTENT_NAME, props.__scopeSelect);
  const [fragment, setFragment] = (0, import_react.useState)();
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    setFragment(new DocumentFragment());
  }, []);
  if (!context.open) {
    const frag = fragment;
    return frag ? /* @__PURE__ */ (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectContentProvider, {
      scope: props.__scopeSelect
    }, /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$Collection.Slot, {
      scope: props.__scopeSelect
    }, /* @__PURE__ */ (0, import_react.createElement)("div", null, props.children))), frag) : null;
  }
  return /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectContentImpl, _extends({}, props, {
    ref: forwardedRef
  }));
});
var $cc7e05a45900e73f$var$CONTENT_MARGIN = 10;
var [$cc7e05a45900e73f$var$SelectContentProvider, $cc7e05a45900e73f$var$useSelectContentContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$CONTENT_NAME);
var $cc7e05a45900e73f$var$SelectContentImpl = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const {
    __scopeSelect,
    position = "item-aligned",
    onCloseAutoFocus,
    onEscapeKeyDown,
    onPointerDownOutside,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    hideWhenDetached,
    avoidCollisions,
    //
    ...contentProps
  } = props;
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$CONTENT_NAME, __scopeSelect);
  const [content, setContent] = (0, import_react.useState)(null);
  const [viewport, setViewport] = (0, import_react.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setContent(node)
  );
  const [selectedItem, setSelectedItem] = (0, import_react.useState)(null);
  const [selectedItemText, setSelectedItemText] = (0, import_react.useState)(null);
  const getItems = $cc7e05a45900e73f$var$useCollection(__scopeSelect);
  const [isPositioned, setIsPositioned] = (0, import_react.useState)(false);
  const firstValidItemFoundRef = (0, import_react.useRef)(false);
  (0, import_react.useEffect)(() => {
    if (content)
      return hideOthers(content);
  }, [
    content
  ]);
  $3db38b7d1fb3fe6a$export$b7ece24a22aeda8c();
  const focusFirst = (0, import_react.useCallback)((candidates) => {
    const [firstItem, ...restItems] = getItems().map(
      (item) => item.ref.current
    );
    const [lastItem] = restItems.slice(-1);
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT)
        return;
      candidate === null || candidate === void 0 || candidate.scrollIntoView({
        block: "nearest"
      });
      if (candidate === firstItem && viewport)
        viewport.scrollTop = 0;
      if (candidate === lastItem && viewport)
        viewport.scrollTop = viewport.scrollHeight;
      candidate === null || candidate === void 0 || candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT)
        return;
    }
  }, [
    getItems,
    viewport
  ]);
  const focusSelectedItem = (0, import_react.useCallback)(
    () => focusFirst([
      selectedItem,
      content
    ]),
    [
      focusFirst,
      selectedItem,
      content
    ]
  );
  (0, import_react.useEffect)(() => {
    if (isPositioned)
      focusSelectedItem();
  }, [
    isPositioned,
    focusSelectedItem
  ]);
  const { onOpenChange, triggerPointerDownPosRef } = context;
  (0, import_react.useEffect)(() => {
    if (content) {
      let pointerMoveDelta = {
        x: 0,
        y: 0
      };
      const handlePointerMove = (event) => {
        var _triggerPointerDownPo, _triggerPointerDownPo2, _triggerPointerDownPo3, _triggerPointerDownPo4;
        pointerMoveDelta = {
          x: Math.abs(Math.round(event.pageX) - ((_triggerPointerDownPo = (_triggerPointerDownPo2 = triggerPointerDownPosRef.current) === null || _triggerPointerDownPo2 === void 0 ? void 0 : _triggerPointerDownPo2.x) !== null && _triggerPointerDownPo !== void 0 ? _triggerPointerDownPo : 0)),
          y: Math.abs(Math.round(event.pageY) - ((_triggerPointerDownPo3 = (_triggerPointerDownPo4 = triggerPointerDownPosRef.current) === null || _triggerPointerDownPo4 === void 0 ? void 0 : _triggerPointerDownPo4.y) !== null && _triggerPointerDownPo3 !== void 0 ? _triggerPointerDownPo3 : 0))
        };
      };
      const handlePointerUp = (event) => {
        if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10)
          event.preventDefault();
        else if (!content.contains(event.target))
          onOpenChange(false);
        document.removeEventListener("pointermove", handlePointerMove);
        triggerPointerDownPosRef.current = null;
      };
      if (triggerPointerDownPosRef.current !== null) {
        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp, {
          capture: true,
          once: true
        });
      }
      return () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp, {
          capture: true
        });
      };
    }
  }, [
    content,
    onOpenChange,
    triggerPointerDownPosRef
  ]);
  (0, import_react.useEffect)(() => {
    const close = () => onOpenChange(false);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [
    onOpenChange
  ]);
  const [searchRef, handleTypeaheadSearch] = $cc7e05a45900e73f$var$useTypeaheadSearch((search) => {
    const enabledItems = getItems().filter(
      (item) => !item.disabled
    );
    const currentItem = enabledItems.find(
      (item) => item.ref.current === document.activeElement
    );
    const nextItem = $cc7e05a45900e73f$var$findNextItem(enabledItems, search, currentItem);
    if (nextItem)
      setTimeout(
        () => nextItem.ref.current.focus()
      );
  });
  const itemRefCallback = (0, import_react.useCallback)((node, value, disabled) => {
    const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
    const isSelectedItem = context.value !== void 0 && context.value === value;
    if (isSelectedItem || isFirstValidItem) {
      setSelectedItem(node);
      if (isFirstValidItem)
        firstValidItemFoundRef.current = true;
    }
  }, [
    context.value
  ]);
  const handleItemLeave = (0, import_react.useCallback)(
    () => content === null || content === void 0 ? void 0 : content.focus(),
    [
      content
    ]
  );
  const itemTextRefCallback = (0, import_react.useCallback)((node, value, disabled) => {
    const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
    const isSelectedItem = context.value !== void 0 && context.value === value;
    if (isSelectedItem || isFirstValidItem)
      setSelectedItemText(node);
  }, [
    context.value
  ]);
  const SelectPosition = position === "popper" ? $cc7e05a45900e73f$var$SelectPopperPosition : $cc7e05a45900e73f$var$SelectItemAlignedPosition;
  const popperContentProps = SelectPosition === $cc7e05a45900e73f$var$SelectPopperPosition ? {
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    collisionBoundary,
    collisionPadding,
    sticky,
    hideWhenDetached,
    avoidCollisions
  } : {};
  return /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectContentProvider, {
    scope: __scopeSelect,
    content,
    viewport,
    onViewportChange: setViewport,
    itemRefCallback,
    selectedItem,
    onItemLeave: handleItemLeave,
    itemTextRefCallback,
    focusSelectedItem,
    selectedItemText,
    position,
    isPositioned,
    searchRef
  }, /* @__PURE__ */ (0, import_react.createElement)(Combination_default, {
    as: $5e63c961fc1ce211$export$8c6ed5c666ac1360,
    allowPinchZoom: true
  }, /* @__PURE__ */ (0, import_react.createElement)($d3863c46a17e8a28$export$20e40289641fbbb6, {
    asChild: true,
    trapped: context.open,
    onMountAutoFocus: (event) => {
      event.preventDefault();
    },
    onUnmountAutoFocus: $e42e1063c40fb3ef$export$b9ecd428b558ff10(onCloseAutoFocus, (event) => {
      var _context$trigger;
      (_context$trigger = context.trigger) === null || _context$trigger === void 0 || _context$trigger.focus({
        preventScroll: true
      });
      event.preventDefault();
    })
  }, /* @__PURE__ */ (0, import_react.createElement)($5cb92bef7577960e$export$177fb62ff3ec1f22, {
    asChild: true,
    disableOutsidePointerEvents: true,
    onEscapeKeyDown,
    onPointerDownOutside,
    onFocusOutside: (event) => event.preventDefault(),
    onDismiss: () => context.onOpenChange(false)
  }, /* @__PURE__ */ (0, import_react.createElement)(SelectPosition, _extends({
    role: "listbox",
    id: context.contentId,
    "data-state": context.open ? "open" : "closed",
    dir: context.dir,
    onContextMenu: (event) => event.preventDefault()
  }, contentProps, popperContentProps, {
    onPlaced: () => setIsPositioned(true),
    ref: composedRefs,
    style: {
      // flex layout so we can place the scroll buttons properly
      display: "flex",
      flexDirection: "column",
      // reset the outline by default as the content MAY get focused
      outline: "none",
      ...contentProps.style
    },
    onKeyDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(contentProps.onKeyDown, (event) => {
      const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
      if (event.key === "Tab")
        event.preventDefault();
      if (!isModifierKey && event.key.length === 1)
        handleTypeaheadSearch(event.key);
      if ([
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End"
      ].includes(event.key)) {
        const items = getItems().filter(
          (item) => !item.disabled
        );
        let candidateNodes = items.map(
          (item) => item.ref.current
        );
        if ([
          "ArrowUp",
          "End"
        ].includes(event.key))
          candidateNodes = candidateNodes.slice().reverse();
        if ([
          "ArrowUp",
          "ArrowDown"
        ].includes(event.key)) {
          const currentElement = event.target;
          const currentIndex = candidateNodes.indexOf(currentElement);
          candidateNodes = candidateNodes.slice(currentIndex + 1);
        }
        setTimeout(
          () => focusFirst(candidateNodes)
        );
        event.preventDefault();
      }
    })
  }))))));
});
var $cc7e05a45900e73f$var$SelectItemAlignedPosition = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, onPlaced, ...popperProps } = props;
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$CONTENT_NAME, __scopeSelect);
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$CONTENT_NAME, __scopeSelect);
  const [contentWrapper, setContentWrapper] = (0, import_react.useState)(null);
  const [content, setContent] = (0, import_react.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setContent(node)
  );
  const getItems = $cc7e05a45900e73f$var$useCollection(__scopeSelect);
  const shouldExpandOnScrollRef = (0, import_react.useRef)(false);
  const shouldRepositionRef = (0, import_react.useRef)(true);
  const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
  const position = (0, import_react.useCallback)(() => {
    if (context.trigger && context.valueNode && contentWrapper && content && viewport && selectedItem && selectedItemText) {
      const triggerRect = context.trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const valueNodeRect = context.valueNode.getBoundingClientRect();
      const itemTextRect = selectedItemText.getBoundingClientRect();
      if (context.dir !== "rtl") {
        const itemTextOffset = itemTextRect.left - contentRect.left;
        const left = valueNodeRect.left - itemTextOffset;
        const leftDelta = triggerRect.left - left;
        const minContentWidth = triggerRect.width + leftDelta;
        const contentWidth = Math.max(minContentWidth, contentRect.width);
        const rightEdge = window.innerWidth - $cc7e05a45900e73f$var$CONTENT_MARGIN;
        const clampedLeft = $ae6933e535247d3d$export$7d15b64cf5a3a4c4(left, [
          $cc7e05a45900e73f$var$CONTENT_MARGIN,
          rightEdge - contentWidth
        ]);
        contentWrapper.style.minWidth = minContentWidth + "px";
        contentWrapper.style.left = clampedLeft + "px";
      } else {
        const itemTextOffset = contentRect.right - itemTextRect.right;
        const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
        const rightDelta = window.innerWidth - triggerRect.right - right;
        const minContentWidth = triggerRect.width + rightDelta;
        const contentWidth = Math.max(minContentWidth, contentRect.width);
        const leftEdge = window.innerWidth - $cc7e05a45900e73f$var$CONTENT_MARGIN;
        const clampedRight = $ae6933e535247d3d$export$7d15b64cf5a3a4c4(right, [
          $cc7e05a45900e73f$var$CONTENT_MARGIN,
          leftEdge - contentWidth
        ]);
        contentWrapper.style.minWidth = minContentWidth + "px";
        contentWrapper.style.right = clampedRight + "px";
      }
      const items = getItems();
      const availableHeight = window.innerHeight - $cc7e05a45900e73f$var$CONTENT_MARGIN * 2;
      const itemsHeight = viewport.scrollHeight;
      const contentStyles = window.getComputedStyle(content);
      const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
      const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
      const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
      const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
      const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth;
      const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);
      const viewportStyles = window.getComputedStyle(viewport);
      const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
      const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);
      const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - $cc7e05a45900e73f$var$CONTENT_MARGIN;
      const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
      const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
      const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
      const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
      const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
      const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;
      if (willAlignWithoutTopOverflow) {
        const isLastItem = selectedItem === items[items.length - 1].ref.current;
        contentWrapper.style.bottom = "0px";
        const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
        const clampedTriggerMiddleToBottomEdge = Math.max(triggerMiddleToBottomEdge, selectedItemHalfHeight + (isLastItem ? viewportPaddingBottom : 0) + viewportOffsetBottom + contentBorderBottomWidth);
        const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
        contentWrapper.style.height = height + "px";
      } else {
        const isFirstItem = selectedItem === items[0].ref.current;
        contentWrapper.style.top = "0px";
        const clampedTopEdgeToTriggerMiddle = Math.max(topEdgeToTriggerMiddle, contentBorderTopWidth + viewport.offsetTop + (isFirstItem ? viewportPaddingTop : 0) + selectedItemHalfHeight);
        const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
        contentWrapper.style.height = height + "px";
        viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
      }
      contentWrapper.style.margin = `${$cc7e05a45900e73f$var$CONTENT_MARGIN}px 0`;
      contentWrapper.style.minHeight = minContentHeight + "px";
      contentWrapper.style.maxHeight = availableHeight + "px";
      onPlaced === null || onPlaced === void 0 || onPlaced();
      requestAnimationFrame(
        () => shouldExpandOnScrollRef.current = true
      );
    }
  }, [
    getItems,
    context.trigger,
    context.valueNode,
    contentWrapper,
    content,
    viewport,
    selectedItem,
    selectedItemText,
    context.dir,
    onPlaced
  ]);
  $9f79659886946c16$export$e5c5a5f917a5871c(
    () => position(),
    [
      position
    ]
  );
  const [contentZIndex, setContentZIndex] = (0, import_react.useState)();
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    if (content)
      setContentZIndex(window.getComputedStyle(content).zIndex);
  }, [
    content
  ]);
  const handleScrollButtonChange = (0, import_react.useCallback)((node) => {
    if (node && shouldRepositionRef.current === true) {
      position();
      focusSelectedItem === null || focusSelectedItem === void 0 || focusSelectedItem();
      shouldRepositionRef.current = false;
    }
  }, [
    position,
    focusSelectedItem
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectViewportProvider, {
    scope: __scopeSelect,
    contentWrapper,
    shouldExpandOnScrollRef,
    onScrollButtonChange: handleScrollButtonChange
  }, /* @__PURE__ */ (0, import_react.createElement)("div", {
    ref: setContentWrapper,
    style: {
      display: "flex",
      flexDirection: "column",
      position: "fixed",
      zIndex: contentZIndex
    }
  }, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({}, popperProps, {
    ref: composedRefs,
    style: {
      // When we get the height of the content, it includes borders. If we were to set
      // the height without having `boxSizing: 'border-box'` it would be too big.
      boxSizing: "border-box",
      // We need to ensure the content doesn't get taller than the wrapper
      maxHeight: "100%",
      ...popperProps.style
    }
  }))));
});
var $cc7e05a45900e73f$var$SelectPopperPosition = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, align = "start", collisionPadding = $cc7e05a45900e73f$var$CONTENT_MARGIN, ...popperProps } = props;
  const popperScope = $cc7e05a45900e73f$var$usePopperScope(__scopeSelect);
  return /* @__PURE__ */ (0, import_react.createElement)($cf1ac5d9fe0e8206$export$7c6e2c02157bb7d2, _extends({}, popperScope, popperProps, {
    ref: forwardedRef,
    align,
    collisionPadding,
    style: {
      // Ensure border-box for floating-ui calculations
      boxSizing: "border-box",
      ...popperProps.style,
      "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
      "--radix-select-content-available-width": "var(--radix-popper-available-width)",
      "--radix-select-content-available-height": "var(--radix-popper-available-height)",
      "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
      "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
    }
  }));
});
var [$cc7e05a45900e73f$var$SelectViewportProvider, $cc7e05a45900e73f$var$useSelectViewportContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$CONTENT_NAME, {});
var $cc7e05a45900e73f$var$VIEWPORT_NAME = "SelectViewport";
var $cc7e05a45900e73f$export$9ed6e7b40248d36d = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, ...viewportProps } = props;
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$VIEWPORT_NAME, __scopeSelect);
  const viewportContext = $cc7e05a45900e73f$var$useSelectViewportContext($cc7e05a45900e73f$var$VIEWPORT_NAME, __scopeSelect);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, contentContext.onViewportChange);
  const prevScrollTopRef = (0, import_react.useRef)(0);
  return /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)("style", {
    dangerouslySetInnerHTML: {
      __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`
    }
  }), /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$Collection.Slot, {
    scope: __scopeSelect
  }, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    "data-radix-select-viewport": "",
    role: "presentation"
  }, viewportProps, {
    ref: composedRefs,
    style: {
      // we use position: 'relative' here on the `viewport` so that when we call
      // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
      // (independent of the scrollUpButton).
      position: "relative",
      flex: 1,
      overflow: "auto",
      ...viewportProps.style
    },
    onScroll: $e42e1063c40fb3ef$export$b9ecd428b558ff10(viewportProps.onScroll, (event) => {
      const viewport = event.currentTarget;
      const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
      if (shouldExpandOnScrollRef !== null && shouldExpandOnScrollRef !== void 0 && shouldExpandOnScrollRef.current && contentWrapper) {
        const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
        if (scrolledBy > 0) {
          const availableHeight = window.innerHeight - $cc7e05a45900e73f$var$CONTENT_MARGIN * 2;
          const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
          const cssHeight = parseFloat(contentWrapper.style.height);
          const prevHeight = Math.max(cssMinHeight, cssHeight);
          if (prevHeight < availableHeight) {
            const nextHeight = prevHeight + scrolledBy;
            const clampedNextHeight = Math.min(availableHeight, nextHeight);
            const heightDiff = nextHeight - clampedNextHeight;
            contentWrapper.style.height = clampedNextHeight + "px";
            if (contentWrapper.style.bottom === "0px") {
              viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
              contentWrapper.style.justifyContent = "flex-end";
            }
          }
        }
      }
      prevScrollTopRef.current = viewport.scrollTop;
    })
  }))));
});
var $cc7e05a45900e73f$var$GROUP_NAME = "SelectGroup";
var [$cc7e05a45900e73f$var$SelectGroupContextProvider, $cc7e05a45900e73f$var$useSelectGroupContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$GROUP_NAME);
var $cc7e05a45900e73f$var$LABEL_NAME = "SelectLabel";
var $cc7e05a45900e73f$export$f67338d29bd972f8 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, ...labelProps } = props;
  const groupContext = $cc7e05a45900e73f$var$useSelectGroupContext($cc7e05a45900e73f$var$LABEL_NAME, __scopeSelect);
  return /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    id: groupContext.id
  }, labelProps, {
    ref: forwardedRef
  }));
});
var $cc7e05a45900e73f$var$ITEM_NAME = "SelectItem";
var [$cc7e05a45900e73f$var$SelectItemContextProvider, $cc7e05a45900e73f$var$useSelectItemContext] = $cc7e05a45900e73f$var$createSelectContext($cc7e05a45900e73f$var$ITEM_NAME);
var $cc7e05a45900e73f$export$13ef48a934230896 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, value, disabled = false, textValue: textValueProp, ...itemProps } = props;
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$ITEM_NAME, __scopeSelect);
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$ITEM_NAME, __scopeSelect);
  const isSelected = context.value === value;
  const [textValue, setTextValue] = (0, import_react.useState)(textValueProp !== null && textValueProp !== void 0 ? textValueProp : "");
  const [isFocused, setIsFocused] = (0, import_react.useState)(false);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, (node) => {
    var _contentContext$itemR;
    return (_contentContext$itemR = contentContext.itemRefCallback) === null || _contentContext$itemR === void 0 ? void 0 : _contentContext$itemR.call(contentContext, node, value, disabled);
  });
  const textId = $1746a345f3d73bb7$export$f680877a34711e37();
  const handleSelect = () => {
    if (!disabled) {
      context.onValueChange(value);
      context.onOpenChange(false);
    }
  };
  if (value === "")
    throw new Error("A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");
  return /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectItemContextProvider, {
    scope: __scopeSelect,
    value,
    disabled,
    textId,
    isSelected,
    onItemTextChange: (0, import_react.useCallback)((node) => {
      setTextValue((prevTextValue) => {
        var _node$textContent;
        return prevTextValue || ((_node$textContent = node === null || node === void 0 ? void 0 : node.textContent) !== null && _node$textContent !== void 0 ? _node$textContent : "").trim();
      });
    }, [])
  }, /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$Collection.ItemSlot, {
    scope: __scopeSelect,
    value,
    disabled,
    textValue
  }, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    role: "option",
    "aria-labelledby": textId,
    "data-highlighted": isFocused ? "" : void 0,
    "aria-selected": isSelected && isFocused,
    "data-state": isSelected ? "checked" : "unchecked",
    "aria-disabled": disabled || void 0,
    "data-disabled": disabled ? "" : void 0,
    tabIndex: disabled ? void 0 : -1
  }, itemProps, {
    ref: composedRefs,
    onFocus: $e42e1063c40fb3ef$export$b9ecd428b558ff10(
      itemProps.onFocus,
      () => setIsFocused(true)
    ),
    onBlur: $e42e1063c40fb3ef$export$b9ecd428b558ff10(
      itemProps.onBlur,
      () => setIsFocused(false)
    ),
    onPointerUp: $e42e1063c40fb3ef$export$b9ecd428b558ff10(itemProps.onPointerUp, handleSelect),
    onPointerMove: $e42e1063c40fb3ef$export$b9ecd428b558ff10(itemProps.onPointerMove, (event) => {
      if (disabled) {
        var _contentContext$onIte;
        (_contentContext$onIte = contentContext.onItemLeave) === null || _contentContext$onIte === void 0 || _contentContext$onIte.call(contentContext);
      } else
        event.currentTarget.focus({
          preventScroll: true
        });
    }),
    onPointerLeave: $e42e1063c40fb3ef$export$b9ecd428b558ff10(itemProps.onPointerLeave, (event) => {
      if (event.currentTarget === document.activeElement) {
        var _contentContext$onIte2;
        (_contentContext$onIte2 = contentContext.onItemLeave) === null || _contentContext$onIte2 === void 0 || _contentContext$onIte2.call(contentContext);
      }
    }),
    onKeyDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(itemProps.onKeyDown, (event) => {
      var _contentContext$searc;
      const isTypingAhead = ((_contentContext$searc = contentContext.searchRef) === null || _contentContext$searc === void 0 ? void 0 : _contentContext$searc.current) !== "";
      if (isTypingAhead && event.key === " ")
        return;
      if ($cc7e05a45900e73f$var$SELECTION_KEYS.includes(event.key))
        handleSelect();
      if (event.key === " ")
        event.preventDefault();
    })
  }))));
});
var $cc7e05a45900e73f$var$ITEM_TEXT_NAME = "SelectItemText";
var $cc7e05a45900e73f$export$3572fb0fb821ff49 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, className, style, ...itemTextProps } = props;
  const context = $cc7e05a45900e73f$var$useSelectContext($cc7e05a45900e73f$var$ITEM_TEXT_NAME, __scopeSelect);
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$ITEM_TEXT_NAME, __scopeSelect);
  const itemContext = $cc7e05a45900e73f$var$useSelectItemContext($cc7e05a45900e73f$var$ITEM_TEXT_NAME, __scopeSelect);
  const nativeOptionsContext = $cc7e05a45900e73f$var$useSelectNativeOptionsContext($cc7e05a45900e73f$var$ITEM_TEXT_NAME, __scopeSelect);
  const [itemTextNode, setItemTextNode] = (0, import_react.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setItemTextNode(node),
    itemContext.onItemTextChange,
    (node) => {
      var _contentContext$itemT;
      return (_contentContext$itemT = contentContext.itemTextRefCallback) === null || _contentContext$itemT === void 0 ? void 0 : _contentContext$itemT.call(contentContext, node, itemContext.value, itemContext.disabled);
    }
  );
  const textContent = itemTextNode === null || itemTextNode === void 0 ? void 0 : itemTextNode.textContent;
  const nativeOption = (0, import_react.useMemo)(
    () => /* @__PURE__ */ (0, import_react.createElement)("option", {
      key: itemContext.value,
      value: itemContext.value,
      disabled: itemContext.disabled
    }, textContent),
    [
      itemContext.disabled,
      itemContext.value,
      textContent
    ]
  );
  const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    onNativeOptionAdd(nativeOption);
    return () => onNativeOptionRemove(nativeOption);
  }, [
    onNativeOptionAdd,
    onNativeOptionRemove,
    nativeOption
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)(import_react.Fragment, null, /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    id: itemContext.textId
  }, itemTextProps, {
    ref: composedRefs
  })), itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren ? /* @__PURE__ */ (0, import_react_dom.createPortal)(itemTextProps.children, context.valueNode) : null);
});
var $cc7e05a45900e73f$var$ITEM_INDICATOR_NAME = "SelectItemIndicator";
var $cc7e05a45900e73f$export$6b9198de19accfe6 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, ...itemIndicatorProps } = props;
  const itemContext = $cc7e05a45900e73f$var$useSelectItemContext($cc7e05a45900e73f$var$ITEM_INDICATOR_NAME, __scopeSelect);
  return itemContext.isSelected ? /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    "aria-hidden": true
  }, itemIndicatorProps, {
    ref: forwardedRef
  })) : null;
});
var $cc7e05a45900e73f$var$SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
var $cc7e05a45900e73f$export$d8117927658af6d7 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
  const viewportContext = $cc7e05a45900e73f$var$useSelectViewportContext($cc7e05a45900e73f$var$SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
  const [canScrollUp1, setCanScrollUp] = (0, import_react.useState)(false);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, viewportContext.onScrollButtonChange);
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    if (contentContext.viewport && contentContext.isPositioned) {
      let handleScroll = function() {
        const canScrollUp = viewport.scrollTop > 0;
        setCanScrollUp(canScrollUp);
      };
      const viewport = contentContext.viewport;
      handleScroll();
      viewport.addEventListener("scroll", handleScroll);
      return () => viewport.removeEventListener("scroll", handleScroll);
    }
  }, [
    contentContext.viewport,
    contentContext.isPositioned
  ]);
  return canScrollUp1 ? /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectScrollButtonImpl, _extends({}, props, {
    ref: composedRefs,
    onAutoScroll: () => {
      const { viewport, selectedItem } = contentContext;
      if (viewport && selectedItem)
        viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
    }
  })) : null;
});
var $cc7e05a45900e73f$var$SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
var $cc7e05a45900e73f$export$ff951e476c12189 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext($cc7e05a45900e73f$var$SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
  const viewportContext = $cc7e05a45900e73f$var$useSelectViewportContext($cc7e05a45900e73f$var$SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
  const [canScrollDown1, setCanScrollDown] = (0, import_react.useState)(false);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, viewportContext.onScrollButtonChange);
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    if (contentContext.viewport && contentContext.isPositioned) {
      let handleScroll = function() {
        const maxScroll = viewport.scrollHeight - viewport.clientHeight;
        const canScrollDown = Math.ceil(viewport.scrollTop) < maxScroll;
        setCanScrollDown(canScrollDown);
      };
      const viewport = contentContext.viewport;
      handleScroll();
      viewport.addEventListener("scroll", handleScroll);
      return () => viewport.removeEventListener("scroll", handleScroll);
    }
  }, [
    contentContext.viewport,
    contentContext.isPositioned
  ]);
  return canScrollDown1 ? /* @__PURE__ */ (0, import_react.createElement)($cc7e05a45900e73f$var$SelectScrollButtonImpl, _extends({}, props, {
    ref: composedRefs,
    onAutoScroll: () => {
      const { viewport, selectedItem } = contentContext;
      if (viewport && selectedItem)
        viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
    }
  })) : null;
});
var $cc7e05a45900e73f$var$SelectScrollButtonImpl = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
  const contentContext = $cc7e05a45900e73f$var$useSelectContentContext("SelectScrollButton", __scopeSelect);
  const autoScrollTimerRef = (0, import_react.useRef)(null);
  const getItems = $cc7e05a45900e73f$var$useCollection(__scopeSelect);
  const clearAutoScrollTimer = (0, import_react.useCallback)(() => {
    if (autoScrollTimerRef.current !== null) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);
  (0, import_react.useEffect)(() => {
    return () => clearAutoScrollTimer();
  }, [
    clearAutoScrollTimer
  ]);
  $9f79659886946c16$export$e5c5a5f917a5871c(() => {
    var _activeItem$ref$curre;
    const activeItem = getItems().find(
      (item) => item.ref.current === document.activeElement
    );
    activeItem === null || activeItem === void 0 || (_activeItem$ref$curre = activeItem.ref.current) === null || _activeItem$ref$curre === void 0 || _activeItem$ref$curre.scrollIntoView({
      block: "nearest"
    });
  }, [
    getItems
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    "aria-hidden": true
  }, scrollIndicatorProps, {
    ref: forwardedRef,
    style: {
      flexShrink: 0,
      ...scrollIndicatorProps.style
    },
    onPointerDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10(scrollIndicatorProps.onPointerDown, () => {
      if (autoScrollTimerRef.current === null)
        autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
    }),
    onPointerMove: $e42e1063c40fb3ef$export$b9ecd428b558ff10(scrollIndicatorProps.onPointerMove, () => {
      var _contentContext$onIte3;
      (_contentContext$onIte3 = contentContext.onItemLeave) === null || _contentContext$onIte3 === void 0 || _contentContext$onIte3.call(contentContext);
      if (autoScrollTimerRef.current === null)
        autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
    }),
    onPointerLeave: $e42e1063c40fb3ef$export$b9ecd428b558ff10(scrollIndicatorProps.onPointerLeave, () => {
      clearAutoScrollTimer();
    })
  }));
});
var $cc7e05a45900e73f$export$eba4b1df07cb1d3 = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { __scopeSelect, ...separatorProps } = props;
  return /* @__PURE__ */ (0, import_react.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    "aria-hidden": true
  }, separatorProps, {
    ref: forwardedRef
  }));
});
function $cc7e05a45900e73f$var$shouldShowPlaceholder(value) {
  return value === "" || value === void 0;
}
var $cc7e05a45900e73f$var$BubbleSelect = /* @__PURE__ */ (0, import_react.forwardRef)((props, forwardedRef) => {
  const { value, ...selectProps } = props;
  const ref = (0, import_react.useRef)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, ref);
  const prevValue = $010c2913dbd2fe3d$export$5cae361ad82dce8b(value);
  (0, import_react.useEffect)(() => {
    const select = ref.current;
    const selectProto = window.HTMLSelectElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(selectProto, "value");
    const setValue = descriptor.set;
    if (prevValue !== value && setValue) {
      const event = new Event("change", {
        bubbles: true
      });
      setValue.call(select, value);
      select.dispatchEvent(event);
    }
  }, [
    prevValue,
    value
  ]);
  return /* @__PURE__ */ (0, import_react.createElement)($ea1ef594cf570d83$export$439d29a4e110a164, {
    asChild: true
  }, /* @__PURE__ */ (0, import_react.createElement)("select", _extends({}, selectProps, {
    ref: composedRefs,
    defaultValue: value
  })));
});
$cc7e05a45900e73f$var$BubbleSelect.displayName = "BubbleSelect";
function $cc7e05a45900e73f$var$useTypeaheadSearch(onSearchChange) {
  const handleSearchChange = $b1b2314f5f9a1d84$export$25bec8c6f54ee79a(onSearchChange);
  const searchRef = (0, import_react.useRef)("");
  const timerRef = (0, import_react.useRef)(0);
  const handleTypeaheadSearch = (0, import_react.useCallback)((key) => {
    const search = searchRef.current + key;
    handleSearchChange(search);
    (function updateSearch(value) {
      searchRef.current = value;
      window.clearTimeout(timerRef.current);
      if (value !== "")
        timerRef.current = window.setTimeout(
          () => updateSearch(""),
          1e3
        );
    })(search);
  }, [
    handleSearchChange
  ]);
  const resetTypeahead = (0, import_react.useCallback)(() => {
    searchRef.current = "";
    window.clearTimeout(timerRef.current);
  }, []);
  (0, import_react.useEffect)(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);
  return [
    searchRef,
    handleTypeaheadSearch,
    resetTypeahead
  ];
}
function $cc7e05a45900e73f$var$findNextItem(items, search, currentItem) {
  const isRepeated = search.length > 1 && Array.from(search).every(
    (char) => char === search[0]
  );
  const normalizedSearch = isRepeated ? search[0] : search;
  const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
  let wrappedItems = $cc7e05a45900e73f$var$wrapArray(items, Math.max(currentItemIndex, 0));
  const excludeCurrentItem = normalizedSearch.length === 1;
  if (excludeCurrentItem)
    wrappedItems = wrappedItems.filter(
      (v) => v !== currentItem
    );
  const nextItem = wrappedItems.find(
    (item) => item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
  );
  return nextItem !== currentItem ? nextItem : void 0;
}
function $cc7e05a45900e73f$var$wrapArray(array, startIndex) {
  return array.map(
    (_, index) => array[(startIndex + index) % array.length]
  );
}
var $cc7e05a45900e73f$export$be92b6f5f03c0fe9 = $cc7e05a45900e73f$export$ef9b1a59e592288f;
var $cc7e05a45900e73f$export$41fb9f06171c75f4 = $cc7e05a45900e73f$export$3ac1e88a1c0b9f1;
var $cc7e05a45900e73f$export$4c8d1a57a761ef94 = $cc7e05a45900e73f$export$e288731fd71264f0;
var $cc7e05a45900e73f$export$f04a61298a47a40f = $cc7e05a45900e73f$export$99b400cabb58c515;
var $cc7e05a45900e73f$export$602eac185826482c = $cc7e05a45900e73f$export$b2af6c9944296213;
var $cc7e05a45900e73f$export$7c6e2c02157bb7d2 = $cc7e05a45900e73f$export$c973a4b3cb86a03d;
var $cc7e05a45900e73f$export$d5c6c08dc2d3ca7 = $cc7e05a45900e73f$export$9ed6e7b40248d36d;
var $cc7e05a45900e73f$export$b04be29aa201d4f5 = $cc7e05a45900e73f$export$f67338d29bd972f8;
var $cc7e05a45900e73f$export$6d08773d2e66f8f2 = $cc7e05a45900e73f$export$13ef48a934230896;
var $cc7e05a45900e73f$export$d6e5bf9c43ea9319 = $cc7e05a45900e73f$export$3572fb0fb821ff49;
var $cc7e05a45900e73f$export$c3468e2714d175fa = $cc7e05a45900e73f$export$6b9198de19accfe6;
var $cc7e05a45900e73f$export$2f60d3ec9ad468f2 = $cc7e05a45900e73f$export$d8117927658af6d7;
var $cc7e05a45900e73f$export$bf1aedc3039c8d63 = $cc7e05a45900e73f$export$ff951e476c12189;
var $cc7e05a45900e73f$export$1ff3c3f08ae963c0 = $cc7e05a45900e73f$export$eba4b1df07cb1d3;

// app/components/ui/select.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/select.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/select.tsx"
  );
  import.meta.hot.lastModified = "1706141197261.1753";
}
var Select = $cc7e05a45900e73f$export$be92b6f5f03c0fe9;
var SelectValue = $cc7e05a45900e73f$export$4c8d1a57a761ef94;
var SelectTrigger = React.forwardRef(_c = ({
  className,
  children,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$41fb9f06171c75f4, { ref, className: cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", className), ...props, children: [
  children,
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$f04a61298a47a40f, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ChevronDown, { className: "h-4 w-4 opacity-50" }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 35,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 34,
    columnNumber: 3
  }, this)
] }, void 0, true, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 32,
  columnNumber: 12
}, this));
_c2 = SelectTrigger;
SelectTrigger.displayName = $cc7e05a45900e73f$export$41fb9f06171c75f4.displayName;
var SelectScrollUpButton = React.forwardRef(_c3 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$2f60d3ec9ad468f2, { ref, className: cn("flex cursor-default items-center justify-center py-1", className), ...props, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ChevronUp, { className: "h-4 w-4" }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 44,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 43,
  columnNumber: 12
}, this));
_c4 = SelectScrollUpButton;
SelectScrollUpButton.displayName = $cc7e05a45900e73f$export$2f60d3ec9ad468f2.displayName;
var SelectScrollDownButton = React.forwardRef(_c5 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$bf1aedc3039c8d63, { ref, className: cn("flex cursor-default items-center justify-center py-1", className), ...props, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ChevronDown, { className: "h-4 w-4" }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 52,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 51,
  columnNumber: 12
}, this));
_c6 = SelectScrollDownButton;
SelectScrollDownButton.displayName = $cc7e05a45900e73f$export$bf1aedc3039c8d63.displayName;
var SelectContent = React.forwardRef(_c7 = ({
  className,
  children,
  position = "popper",
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$602eac185826482c, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$7c6e2c02157bb7d2, { ref, className: cn("relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className), position, ...props, children: [
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SelectScrollUpButton, {}, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 63,
    columnNumber: 4
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$d5c6c08dc2d3ca7, { className: cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"), children }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 64,
    columnNumber: 4
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(SelectScrollDownButton, {}, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 67,
    columnNumber: 4
  }, this)
] }, void 0, true, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 62,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 61,
  columnNumber: 12
}, this));
_c8 = SelectContent;
SelectContent.displayName = $cc7e05a45900e73f$export$7c6e2c02157bb7d2.displayName;
var SelectLabel = React.forwardRef(_c9 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$b04be29aa201d4f5, { ref, className: cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className), ...props }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 75,
  columnNumber: 12
}, this));
_c10 = SelectLabel;
SelectLabel.displayName = $cc7e05a45900e73f$export$b04be29aa201d4f5.displayName;
var SelectItem = React.forwardRef(_c11 = ({
  className,
  children,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$6d08773d2e66f8f2, { ref, className: cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className), ...props, children: [
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$c3468e2714d175fa, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Check, { className: "h-4 w-4" }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 85,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 84,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 83,
    columnNumber: 3
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$d6e5bf9c43ea9319, { children }, void 0, false, {
    fileName: "app/components/ui/select.tsx",
    lineNumber: 89,
    columnNumber: 3
  }, this)
] }, void 0, true, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 82,
  columnNumber: 12
}, this));
_c12 = SelectItem;
SelectItem.displayName = $cc7e05a45900e73f$export$6d08773d2e66f8f2.displayName;
var SelectSeparator = React.forwardRef(_c13 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)($cc7e05a45900e73f$export$1ff3c3f08ae963c0, { ref, className: cn("-mx-1 my-1 h-px bg-muted", className), ...props }, void 0, false, {
  fileName: "app/components/ui/select.tsx",
  lineNumber: 96,
  columnNumber: 12
}, this));
_c14 = SelectSeparator;
SelectSeparator.displayName = $cc7e05a45900e73f$export$1ff3c3f08ae963c0.displayName;
var _c;
var _c2;
var _c3;
var _c4;
var _c5;
var _c6;
var _c7;
var _c8;
var _c9;
var _c10;
var _c11;
var _c12;
var _c13;
var _c14;
$RefreshReg$(_c, "SelectTrigger$React.forwardRef");
$RefreshReg$(_c2, "SelectTrigger");
$RefreshReg$(_c3, "SelectScrollUpButton$React.forwardRef");
$RefreshReg$(_c4, "SelectScrollUpButton");
$RefreshReg$(_c5, "SelectScrollDownButton$React.forwardRef");
$RefreshReg$(_c6, "SelectScrollDownButton");
$RefreshReg$(_c7, "SelectContent$React.forwardRef");
$RefreshReg$(_c8, "SelectContent");
$RefreshReg$(_c9, "SelectLabel$React.forwardRef");
$RefreshReg$(_c10, "SelectLabel");
$RefreshReg$(_c11, "SelectItem$React.forwardRef");
$RefreshReg$(_c12, "SelectItem");
$RefreshReg$(_c13, "SelectSeparator$React.forwardRef");
$RefreshReg$(_c14, "SelectSeparator");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-select.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-select.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-select.tsx"
  );
  import.meta.hot.lastModified = "1706163907016.1199";
}
function FormSelect({
  labelProps,
  selectProps,
  errors,
  className
}) {
  _s();
  const fallbackId = (0, import_react2.useId)();
  const id = selectProps.id ?? fallbackId;
  const errorId = errors?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { htmlFor: id, ...labelProps }, void 0, false, {
      fileName: "app/components/forms/form-select.tsx",
      lineNumber: 37,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Select, { ...selectProps, value: selectProps.value?.toString(), defaultValue: selectProps.defaultValue?.toString(), dir: "ltr", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(SelectTrigger, { className: "w-[180px]", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(SelectValue, { placeholder: "Select" }, void 0, false, {
        fileName: "app/components/forms/form-select.tsx",
        lineNumber: 40,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-select.tsx",
        lineNumber: 39,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(SelectContent, { children: selectProps.options.map((opt) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(SelectItem, { value: opt.value, children: opt.label }, opt.value, false, {
        fileName: "app/components/forms/form-select.tsx",
        lineNumber: 43,
        columnNumber: 38
      }, this)) }, void 0, false, {
        fileName: "app/components/forms/form-select.tsx",
        lineNumber: 42,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-select.tsx",
      lineNumber: 38,
      columnNumber: 4
    }, this),
    errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ErrorList, { id: errorId, errors }, void 0, false, {
      fileName: "app/components/forms/form-select.tsx",
      lineNumber: 49,
      columnNumber: 15
    }, this) : null
  ] }, void 0, true, {
    fileName: "app/components/forms/form-select.tsx",
    lineNumber: 36,
    columnNumber: 10
  }, this);
}
_s(FormSelect, "i2GpmVP4tZRTGa8NQ93f/KVTRgI=", false, function() {
  return [import_react2.useId];
});
_c15 = FormSelect;
var _c15;
$RefreshReg$(_c15, "FormSelect");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/_auth+/onboarding.tsx
var import_auth_server = __toESM(require_auth_server(), 1);
var import_csrf_server = __toESM(require_csrf_server(), 1);
var import_db_server = __toESM(require_db_server(), 1);
var import_honeypot_server = __toESM(require_honeypot_server(), 1);
var import_session_server = __toESM(require_session_server(), 1);
var import_toast_server = __toESM(require_toast_server(), 1);
var import_verification_server = __toESM(require_verification_server(), 1);
var import_jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/_auth+/onboarding.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/_auth+/onboarding.tsx"
  );
  import.meta.hot.lastModified = "1708316645857.1138";
}
var SignupFormSchema = z.object({
  name: NameSchema,
  school: z.string(),
  teacher: z.string(),
  grade: z.string(),
  workshopTeacherId: z.string().optional(),
  remember: z.boolean().optional(),
  redirectTo: z.string().optional()
}).and(PasswordAndConfirmPasswordSchema);
_c16 = SignupFormSchema;
var meta = () => {
  return [{
    title: "Setup Yawp! Account"
  }];
};
function SignupRoute() {
  _s2();
  const data = useLoaderData();
  const actionData = useActionData();
  const isPending = useIsPending();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const [form, fields] = useForm({
    id: "onboarding-form",
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
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "mx-auto w-full max-w-md px-2 py-20", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex flex-col gap-3 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h1", { children: [
        "Welcome, ",
        data.email,
        "!"
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 173,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: "Please enter your details." }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 174,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/onboarding.tsx",
      lineNumber: 172,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Form, { method: "POST", className: "mx-auto mt-20 flex min-w-full max-w-sm flex-col gap-3 px-8 sm:min-w-[368px]", ...getFormProps(form), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(AuthenticityTokenInput, {}, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 177,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(HoneypotInputs, {}, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 178,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.name.id,
        children: "Name"
      }, inputProps: {
        ...getInputProps(fields.name, {
          type: "text"
        }),
        autoComplete: "name"
      }, errors: fields.name.errors }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 179,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
          htmlFor: fields.school.id,
          children: "School"
        }, inputProps: {
          ...getInputProps(fields.school, {
            type: "text"
          }),
          autoComplete: "name",
          required: true
        }, errors: fields.school.errors, className: "w-full" }, void 0, false, {
          fileName: "app/routes/_auth+/onboarding.tsx",
          lineNumber: 189,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
          htmlFor: fields.teacher.id,
          children: "Teacher"
        }, inputProps: {
          ...getInputProps(fields.teacher, {
            type: "text"
          }),
          autoComplete: "name",
          required: true
        }, errors: fields.teacher.errors, className: "w-full" }, void 0, false, {
          fileName: "app/routes/_auth+/onboarding.tsx",
          lineNumber: 199,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 188,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
          htmlFor: fields.grade.id,
          children: "Grade"
        }, inputProps: {
          ...getInputProps(fields.grade, {
            type: "text"
          }),
          autoComplete: "name",
          required: true
        }, errors: fields.grade.errors, className: "w-full" }, void 0, false, {
          fileName: "app/routes/_auth+/onboarding.tsx",
          lineNumber: 211,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormSelect, { labelProps: {
          htmlFor: fields.workshopTeacherId.id,
          children: "Yawp! Teacher"
        }, selectProps: {
          ...getInputProps(fields.workshopTeacherId, {
            type: "text"
          }),
          autoComplete: "name",
          defaultValue: data.workshopTeachers[0]?.id,
          options: data.workshopTeachers.map((teacher) => ({
            value: teacher.id,
            label: teacher.name
          }))
        }, errors: fields.workshopTeacherId.errors, className: "w-full" }, void 0, false, {
          fileName: "app/routes/_auth+/onboarding.tsx",
          lineNumber: 221,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 210,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.password.id,
        children: "Password"
      }, inputProps: {
        ...getInputProps(fields.password, {
          type: "password"
        }),
        autoComplete: "new-password"
      }, errors: fields.password.errors }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 236,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormInput, { labelProps: {
        htmlFor: fields.confirmPassword.id,
        children: "Confirm Password"
      }, inputProps: {
        ...getInputProps(fields.confirmPassword, {
          type: "password"
        }),
        autoComplete: "new-password"
      }, errors: fields.confirmPassword.errors }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 246,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(FormCheckbox, { field: fields.remember, labelProps: {
        htmlFor: fields.remember.id,
        children: "Remember me"
      }, buttonProps: getInputProps(fields.remember, {
        type: "checkbox"
      }), errors: fields.remember.errors }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 256,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("input", { ...getInputProps(fields.redirectTo, {
        type: "hidden"
      }) }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 263,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(ErrorList, { errors: form.errors, id: form.errorId }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 266,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex items-center justify-between gap-6", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Button, { className: "mt-4 w-full", type: "submit", disabled: isPending, children: "Create an account" }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 269,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/_auth+/onboarding.tsx",
        lineNumber: 268,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/_auth+/onboarding.tsx",
      lineNumber: 176,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/_auth+/onboarding.tsx",
    lineNumber: 171,
    columnNumber: 10
  }, this);
}
_s2(SignupRoute, "SbEzVWUNyTwM/qcAIjF6pChQLW8=", false, function() {
  return [useLoaderData, useActionData, useIsPending, useSearchParams, useForm];
});
_c22 = SignupRoute;
var _c16;
var _c22;
$RefreshReg$(_c16, "SignupFormSchema");
$RefreshReg$(_c22, "SignupRoute");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  meta,
  SignupRoute
};
//# sourceMappingURL=/build/_shared/chunk-5PDURZFB.js.map
