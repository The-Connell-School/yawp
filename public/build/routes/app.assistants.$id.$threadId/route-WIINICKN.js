import {
  require_shim
} from "/build/_shared/chunk-44XBEHAJ.js";
import {
  require_auth
} from "/build/_shared/chunk-VIRKDLNE.js";
import {
  require_db
} from "/build/_shared/chunk-SISZLHLB.js";
import {
  useUser
} from "/build/_shared/chunk-2OS3T6TQ.js";
import "/build/_shared/chunk-VPD4J5DL.js";
import {
  GeneralErrorBoundary
} from "/build/_shared/chunk-CJLA47HX.js";
import "/build/_shared/chunk-XMFUKDFY.js";
import {
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
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
import {
  AssistantIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  require_node
} from "/build/_shared/chunk-G7CHZRZX.js";
import {
  cn,
  getUserImgSrc
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  useFetcher,
  useLoaderData,
  useParams
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

// app/routes/app.assistants.$id.$threadId/route.tsx
var import_node = __toESM(require_node(), 1);
var import_react7 = __toESM(require_react(), 1);

// app/components/ui/skeleton.tsx
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/skeleton.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/skeleton.tsx"
  );
  import.meta.hot.lastModified = "1706036825709.071";
}
function Skeleton({
  className,
  ...props
}) {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("animate-pulse rounded-md bg-muted", className), ...props }, void 0, false, {
    fileName: "app/components/ui/skeleton.tsx",
    lineNumber: 26,
    columnNumber: 10
  }, this);
}
_c = Skeleton;
var _c;
$RefreshReg$(_c, "Skeleton");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.assistants.$id.$threadId/chat-input.tsx
var import_react = __toESM(require_react(), 1);
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants.$id.$threadId/chat-input.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants.$id.$threadId/chat-input.tsx"
  );
  import.meta.hot.lastModified = "1706066666258.15";
}
var ChatInput = ({
  isDisabled,
  textareaProps,
  onSubmit
}) => {
  _s();
  const textareaRef = (0, import_react.useRef)(null);
  const [hasText, setHasText] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    if (textareaRef.current) {
      const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight);
      textareaRef.current.style.height = Math.max(50, lineHeight) + "px";
    }
  }, []);
  const handleTextareaChange = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "50px";
      textareaRef.current.style.height = Math.max(50, textareaRef.current.scrollHeight + 3) + "px";
      setHasText(!!textareaRef.current.value);
    }
  };
  const handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && hasText) {
      event.preventDefault();
      if (event.currentTarget.form) {
        onSubmit?.(event.currentTarget.form);
      }
      textareaRef.current.value = "";
      if (textareaRef.current) {
        const lineHeight = parseFloat(getComputedStyle(textareaRef.current).lineHeight);
        textareaRef.current.style.height = Math.max(50, lineHeight) + "px";
      }
    }
  };
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: "relative mx-auto flex w-full max-w-[700px] items-center", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("textarea", { className: "no-scrollbar my-auto h-[50px] max-h-[200px] min-h-[50px] w-full resize-none rounded-lg border border-foreground/20 bg-background p-3 pr-14 focus:border-foreground/30 focus:outline-0", placeholder: "Send a message", ref: textareaRef, onChange: handleTextareaChange, onKeyDown: handleKeyDown, disabled: isDisabled, ...textareaProps }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
      lineNumber: 60,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: "Type a message first", open: !hasText || isDisabled ? void 0 : false, delayDuration: 200, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("button", { type: "submit", className: cn("absolute bottom-2 right-2 cursor-pointer rounded-md bg-primary/80 p-2 text-background shadow transition hover:bg-primary/90 active:bg-primary dark:text-foreground", {
      "cursor-default bg-primary/20 text-opacity-10 hover:bg-primary/20 active:bg-primary/20": !hasText || isDisabled
    }), onClick: () => {
      setTimeout(() => {
        textareaRef.current.value = "";
      }, 100);
    }, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "currentColor", className: "h-5 w-5", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("path", { d: "M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
      lineNumber: 70,
      columnNumber: 7
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
      lineNumber: 69,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
      lineNumber: 62,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
      lineNumber: 61,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.$id.$threadId/chat-input.tsx",
    lineNumber: 59,
    columnNumber: 10
  }, this);
};
_s(ChatInput, "vshLq5MZKbYCiam5V0S2pSRElwc=");
_c2 = ChatInput;
var _c2;
$RefreshReg$(_c2, "ChatInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.assistants.$id.$threadId/route.tsx
var import_auth = __toESM(require_auth(), 1);
var import_db = __toESM(require_db(), 1);

// node_modules/swr/dist/core/index.mjs
var import_react3 = __toESM(require_react(), 1);
var import_shim = __toESM(require_shim(), 1);

// node_modules/swr/dist/_internal/index.mjs
var import_react2 = __toESM(require_react(), 1);
var noop = () => {
};
var UNDEFINED = (
  /*#__NOINLINE__*/
  noop()
);
var OBJECT = Object;
var isUndefined = (v) => v === UNDEFINED;
var isFunction = (v) => typeof v == "function";
var mergeObjects = (a, b) => ({
  ...a,
  ...b
});
var isPromiseLike = (x) => isFunction(x.then);
var table = /* @__PURE__ */ new WeakMap();
var counter = 0;
var stableHash = (arg) => {
  const type = typeof arg;
  const constructor = arg && arg.constructor;
  const isDate = constructor == Date;
  let result;
  let index;
  if (OBJECT(arg) === arg && !isDate && constructor != RegExp) {
    result = table.get(arg);
    if (result)
      return result;
    result = ++counter + "~";
    table.set(arg, result);
    if (constructor == Array) {
      result = "@";
      for (index = 0; index < arg.length; index++) {
        result += stableHash(arg[index]) + ",";
      }
      table.set(arg, result);
    }
    if (constructor == OBJECT) {
      result = "#";
      const keys = OBJECT.keys(arg).sort();
      while (!isUndefined(index = keys.pop())) {
        if (!isUndefined(arg[index])) {
          result += index + ":" + stableHash(arg[index]) + ",";
        }
      }
      table.set(arg, result);
    }
  } else {
    result = isDate ? arg.toJSON() : type == "symbol" ? arg.toString() : type == "string" ? JSON.stringify(arg) : "" + arg;
  }
  return result;
};
var SWRGlobalState = /* @__PURE__ */ new WeakMap();
var EMPTY_CACHE = {};
var INITIAL_CACHE = {};
var STR_UNDEFINED = "undefined";
var isWindowDefined = typeof window != STR_UNDEFINED;
var isDocumentDefined = typeof document != STR_UNDEFINED;
var hasRequestAnimationFrame = () => isWindowDefined && typeof window["requestAnimationFrame"] != STR_UNDEFINED;
var createCacheHelper = (cache2, key) => {
  const state = SWRGlobalState.get(cache2);
  return [
    // Getter
    () => !isUndefined(key) && cache2.get(key) || EMPTY_CACHE,
    // Setter
    (info) => {
      if (!isUndefined(key)) {
        const prev = cache2.get(key);
        if (!(key in INITIAL_CACHE)) {
          INITIAL_CACHE[key] = prev;
        }
        state[5](key, mergeObjects(prev, info), prev || EMPTY_CACHE);
      }
    },
    // Subscriber
    state[6],
    // Get server cache snapshot
    () => {
      if (!isUndefined(key)) {
        if (key in INITIAL_CACHE)
          return INITIAL_CACHE[key];
      }
      return !isUndefined(key) && cache2.get(key) || EMPTY_CACHE;
    }
  ];
};
var online = true;
var isOnline = () => online;
var [onWindowEvent, offWindowEvent] = isWindowDefined && window.addEventListener ? [
  window.addEventListener.bind(window),
  window.removeEventListener.bind(window)
] : [
  noop,
  noop
];
var isVisible = () => {
  const visibilityState = isDocumentDefined && document.visibilityState;
  return isUndefined(visibilityState) || visibilityState !== "hidden";
};
var initFocus = (callback) => {
  if (isDocumentDefined) {
    document.addEventListener("visibilitychange", callback);
  }
  onWindowEvent("focus", callback);
  return () => {
    if (isDocumentDefined) {
      document.removeEventListener("visibilitychange", callback);
    }
    offWindowEvent("focus", callback);
  };
};
var initReconnect = (callback) => {
  const onOnline = () => {
    online = true;
    callback();
  };
  const onOffline = () => {
    online = false;
  };
  onWindowEvent("online", onOnline);
  onWindowEvent("offline", onOffline);
  return () => {
    offWindowEvent("online", onOnline);
    offWindowEvent("offline", onOffline);
  };
};
var preset = {
  isOnline,
  isVisible
};
var defaultConfigOptions = {
  initFocus,
  initReconnect
};
var IS_REACT_LEGACY = !import_react2.default.useId;
var IS_SERVER = !isWindowDefined || "Deno" in window;
var rAF = (f) => hasRequestAnimationFrame() ? window["requestAnimationFrame"](f) : setTimeout(f, 1);
var useIsomorphicLayoutEffect = IS_SERVER ? import_react2.useEffect : import_react2.useLayoutEffect;
var navigatorConnection = typeof navigator !== "undefined" && navigator.connection;
var slowConnection = !IS_SERVER && navigatorConnection && ([
  "slow-2g",
  "2g"
].includes(navigatorConnection.effectiveType) || navigatorConnection.saveData);
var serialize = (key) => {
  if (isFunction(key)) {
    try {
      key = key();
    } catch (err) {
      key = "";
    }
  }
  const args = key;
  key = typeof key == "string" ? key : (Array.isArray(key) ? key.length : key) ? stableHash(key) : "";
  return [
    key,
    args
  ];
};
var __timestamp = 0;
var getTimestamp = () => ++__timestamp;
var FOCUS_EVENT = 0;
var RECONNECT_EVENT = 1;
var MUTATE_EVENT = 2;
var ERROR_REVALIDATE_EVENT = 3;
var events = {
  __proto__: null,
  ERROR_REVALIDATE_EVENT,
  FOCUS_EVENT,
  MUTATE_EVENT,
  RECONNECT_EVENT
};
async function internalMutate(...args) {
  const [cache2, _key, _data, _opts] = args;
  const options = mergeObjects({
    populateCache: true,
    throwOnError: true
  }, typeof _opts === "boolean" ? {
    revalidate: _opts
  } : _opts || {});
  let populateCache = options.populateCache;
  const rollbackOnErrorOption = options.rollbackOnError;
  let optimisticData = options.optimisticData;
  const rollbackOnError = (error) => {
    return typeof rollbackOnErrorOption === "function" ? rollbackOnErrorOption(error) : rollbackOnErrorOption !== false;
  };
  const throwOnError = options.throwOnError;
  if (isFunction(_key)) {
    const keyFilter = _key;
    const matchedKeys = [];
    const it = cache2.keys();
    for (const key of it) {
      if (
        // Skip the special useSWRInfinite and useSWRSubscription keys.
        !/^\$(inf|sub)\$/.test(key) && keyFilter(cache2.get(key)._k)
      ) {
        matchedKeys.push(key);
      }
    }
    return Promise.all(matchedKeys.map(mutateByKey));
  }
  return mutateByKey(_key);
  async function mutateByKey(_k) {
    const [key] = serialize(_k);
    if (!key)
      return;
    const [get, set] = createCacheHelper(cache2, key);
    const [EVENT_REVALIDATORS, MUTATION, FETCH, PRELOAD] = SWRGlobalState.get(cache2);
    const startRevalidate = () => {
      const revalidators = EVENT_REVALIDATORS[key];
      const revalidate = isFunction(options.revalidate) ? options.revalidate(get().data, _k) : options.revalidate !== false;
      if (revalidate) {
        delete FETCH[key];
        delete PRELOAD[key];
        if (revalidators && revalidators[0]) {
          return revalidators[0](MUTATE_EVENT).then(() => get().data);
        }
      }
      return get().data;
    };
    if (args.length < 3) {
      return startRevalidate();
    }
    let data = _data;
    let error;
    const beforeMutationTs = getTimestamp();
    MUTATION[key] = [
      beforeMutationTs,
      0
    ];
    const hasOptimisticData = !isUndefined(optimisticData);
    const state = get();
    const displayedData = state.data;
    const currentData = state._c;
    const committedData = isUndefined(currentData) ? displayedData : currentData;
    if (hasOptimisticData) {
      optimisticData = isFunction(optimisticData) ? optimisticData(committedData, displayedData) : optimisticData;
      set({
        data: optimisticData,
        _c: committedData
      });
    }
    if (isFunction(data)) {
      try {
        data = data(committedData);
      } catch (err) {
        error = err;
      }
    }
    if (data && isPromiseLike(data)) {
      data = await data.catch((err) => {
        error = err;
      });
      if (beforeMutationTs !== MUTATION[key][0]) {
        if (error)
          throw error;
        return data;
      } else if (error && hasOptimisticData && rollbackOnError(error)) {
        populateCache = true;
        set({
          data: committedData,
          _c: UNDEFINED
        });
      }
    }
    if (populateCache) {
      if (!error) {
        if (isFunction(populateCache)) {
          const populateCachedData = populateCache(data, committedData);
          set({
            data: populateCachedData,
            error: UNDEFINED,
            _c: UNDEFINED
          });
        } else {
          set({
            data,
            error: UNDEFINED,
            _c: UNDEFINED
          });
        }
      }
    }
    MUTATION[key][1] = getTimestamp();
    Promise.resolve(startRevalidate()).then(() => {
      set({
        _c: UNDEFINED
      });
    });
    if (error) {
      if (throwOnError)
        throw error;
      return;
    }
    return data;
  }
}
var revalidateAllKeys = (revalidators, type) => {
  for (const key in revalidators) {
    if (revalidators[key][0])
      revalidators[key][0](type);
  }
};
var initCache = (provider, options) => {
  if (!SWRGlobalState.has(provider)) {
    const opts = mergeObjects(defaultConfigOptions, options);
    const EVENT_REVALIDATORS = {};
    const mutate2 = internalMutate.bind(UNDEFINED, provider);
    let unmount = noop;
    const subscriptions = {};
    const subscribe = (key, callback) => {
      const subs = subscriptions[key] || [];
      subscriptions[key] = subs;
      subs.push(callback);
      return () => subs.splice(subs.indexOf(callback), 1);
    };
    const setter = (key, value, prev) => {
      provider.set(key, value);
      const subs = subscriptions[key];
      if (subs) {
        for (const fn of subs) {
          fn(value, prev);
        }
      }
    };
    const initProvider = () => {
      if (!SWRGlobalState.has(provider)) {
        SWRGlobalState.set(provider, [
          EVENT_REVALIDATORS,
          {},
          {},
          {},
          mutate2,
          setter,
          subscribe
        ]);
        if (!IS_SERVER) {
          const releaseFocus = opts.initFocus(setTimeout.bind(UNDEFINED, revalidateAllKeys.bind(UNDEFINED, EVENT_REVALIDATORS, FOCUS_EVENT)));
          const releaseReconnect = opts.initReconnect(setTimeout.bind(UNDEFINED, revalidateAllKeys.bind(UNDEFINED, EVENT_REVALIDATORS, RECONNECT_EVENT)));
          unmount = () => {
            releaseFocus && releaseFocus();
            releaseReconnect && releaseReconnect();
            SWRGlobalState.delete(provider);
          };
        }
      }
    };
    initProvider();
    return [
      provider,
      mutate2,
      initProvider,
      unmount
    ];
  }
  return [
    provider,
    SWRGlobalState.get(provider)[4]
  ];
};
var onErrorRetry = (_, __, config, revalidate, opts) => {
  const maxRetryCount = config.errorRetryCount;
  const currentRetryCount = opts.retryCount;
  const timeout = ~~((Math.random() + 0.5) * (1 << (currentRetryCount < 8 ? currentRetryCount : 8))) * config.errorRetryInterval;
  if (!isUndefined(maxRetryCount) && currentRetryCount > maxRetryCount) {
    return;
  }
  setTimeout(revalidate, timeout, opts);
};
var compare = (currentData, newData) => stableHash(currentData) == stableHash(newData);
var [cache, mutate] = initCache(/* @__PURE__ */ new Map());
var defaultConfig = mergeObjects(
  {
    // events
    onLoadingSlow: noop,
    onSuccess: noop,
    onError: noop,
    onErrorRetry,
    onDiscarded: noop,
    // switches
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    shouldRetryOnError: true,
    // timeouts
    errorRetryInterval: slowConnection ? 1e4 : 5e3,
    focusThrottleInterval: 5 * 1e3,
    dedupingInterval: 2 * 1e3,
    loadingTimeout: slowConnection ? 5e3 : 3e3,
    // providers
    compare,
    isPaused: () => false,
    cache,
    mutate,
    fallback: {}
  },
  // use web preset by default
  preset
);
var mergeConfigs = (a, b) => {
  const v = mergeObjects(a, b);
  if (b) {
    const { use: u1, fallback: f1 } = a;
    const { use: u2, fallback: f2 } = b;
    if (u1 && u2) {
      v.use = u1.concat(u2);
    }
    if (f1 && f2) {
      v.fallback = mergeObjects(f1, f2);
    }
  }
  return v;
};
var SWRConfigContext = (0, import_react2.createContext)({});
var SWRConfig = (props) => {
  const { value } = props;
  const parentConfig = (0, import_react2.useContext)(SWRConfigContext);
  const isFunctionalConfig = isFunction(value);
  const config = (0, import_react2.useMemo)(() => isFunctionalConfig ? value(parentConfig) : value, [
    isFunctionalConfig,
    parentConfig,
    value
  ]);
  const extendedConfig = (0, import_react2.useMemo)(() => isFunctionalConfig ? config : mergeConfigs(parentConfig, config), [
    isFunctionalConfig,
    parentConfig,
    config
  ]);
  const provider = config && config.provider;
  const cacheContextRef = (0, import_react2.useRef)(UNDEFINED);
  if (provider && !cacheContextRef.current) {
    cacheContextRef.current = initCache(provider(extendedConfig.cache || cache), config);
  }
  const cacheContext = cacheContextRef.current;
  if (cacheContext) {
    extendedConfig.cache = cacheContext[0];
    extendedConfig.mutate = cacheContext[1];
  }
  useIsomorphicLayoutEffect(() => {
    if (cacheContext) {
      cacheContext[2] && cacheContext[2]();
      return cacheContext[3];
    }
  }, []);
  return (0, import_react2.createElement)(SWRConfigContext.Provider, mergeObjects(props, {
    value: extendedConfig
  }));
};
var INFINITE_PREFIX = "$inf$";
var enableDevtools = isWindowDefined && window.__SWR_DEVTOOLS_USE__;
var use = enableDevtools ? window.__SWR_DEVTOOLS_USE__ : [];
var setupDevTools = () => {
  if (enableDevtools) {
    window.__SWR_DEVTOOLS_REACT__ = import_react2.default;
  }
};
var normalize = (args) => {
  return isFunction(args[1]) ? [
    args[0],
    args[1],
    args[2] || {}
  ] : [
    args[0],
    null,
    (args[1] === null ? args[2] : args[1]) || {}
  ];
};
var useSWRConfig = () => {
  return mergeObjects(defaultConfig, (0, import_react2.useContext)(SWRConfigContext));
};
var middleware = (useSWRNext) => (key_, fetcher_, config) => {
  const fetcher = fetcher_ && ((...args) => {
    const [key] = serialize(key_);
    const [, , , PRELOAD] = SWRGlobalState.get(cache);
    if (key.startsWith(INFINITE_PREFIX)) {
      return fetcher_(...args);
    }
    const req = PRELOAD[key];
    if (isUndefined(req))
      return fetcher_(...args);
    delete PRELOAD[key];
    return req;
  });
  return useSWRNext(key_, fetcher, config);
};
var BUILT_IN_MIDDLEWARE = use.concat(middleware);
var withArgs = (hook) => {
  return function useSWRArgs(...args) {
    const fallbackConfig = useSWRConfig();
    const [key, fn, _config] = normalize(args);
    const config = mergeConfigs(fallbackConfig, _config);
    let next = hook;
    const { use: use3 } = config;
    const middleware2 = (use3 || []).concat(BUILT_IN_MIDDLEWARE);
    for (let i = middleware2.length; i--; ) {
      next = middleware2[i](next);
    }
    return next(key, fn || config.fetcher || null, config);
  };
};
var subscribeCallback = (key, callbacks, callback) => {
  const keyedRevalidators = callbacks[key] || (callbacks[key] = []);
  keyedRevalidators.push(callback);
  return () => {
    const index = keyedRevalidators.indexOf(callback);
    if (index >= 0) {
      keyedRevalidators[index] = keyedRevalidators[keyedRevalidators.length - 1];
      keyedRevalidators.pop();
    }
  };
};
setupDevTools();

// node_modules/swr/dist/core/index.mjs
var use2 = import_react3.default.use || ((promise) => {
  if (promise.status === "pending") {
    throw promise;
  } else if (promise.status === "fulfilled") {
    return promise.value;
  } else if (promise.status === "rejected") {
    throw promise.reason;
  } else {
    promise.status = "pending";
    promise.then((v) => {
      promise.status = "fulfilled";
      promise.value = v;
    }, (e) => {
      promise.status = "rejected";
      promise.reason = e;
    });
    throw promise;
  }
});
var WITH_DEDUPE = {
  dedupe: true
};
var useSWRHandler = (_key, fetcher, config) => {
  const { cache: cache2, compare: compare2, suspense, fallbackData, revalidateOnMount, revalidateIfStale, refreshInterval, refreshWhenHidden, refreshWhenOffline, keepPreviousData } = config;
  const [EVENT_REVALIDATORS, MUTATION, FETCH, PRELOAD] = SWRGlobalState.get(cache2);
  const [key, fnArg] = serialize(_key);
  const initialMountedRef = (0, import_react3.useRef)(false);
  const unmountedRef = (0, import_react3.useRef)(false);
  const keyRef = (0, import_react3.useRef)(key);
  const fetcherRef = (0, import_react3.useRef)(fetcher);
  const configRef = (0, import_react3.useRef)(config);
  const getConfig = () => configRef.current;
  const isActive = () => getConfig().isVisible() && getConfig().isOnline();
  const [getCache, setCache, subscribeCache, getInitialCache] = createCacheHelper(cache2, key);
  const stateDependencies = (0, import_react3.useRef)({}).current;
  const fallback = isUndefined(fallbackData) ? config.fallback[key] : fallbackData;
  const isEqual = (prev, current) => {
    for (const _ in stateDependencies) {
      const t = _;
      if (t === "data") {
        if (!compare2(prev[t], current[t])) {
          if (!isUndefined(prev[t])) {
            return false;
          }
          if (!compare2(returnedData, current[t])) {
            return false;
          }
        }
      } else {
        if (current[t] !== prev[t]) {
          return false;
        }
      }
    }
    return true;
  };
  const getSnapshot = (0, import_react3.useMemo)(() => {
    const shouldStartRequest = (() => {
      if (!key)
        return false;
      if (!fetcher)
        return false;
      if (!isUndefined(revalidateOnMount))
        return revalidateOnMount;
      if (getConfig().isPaused())
        return false;
      if (suspense)
        return false;
      if (!isUndefined(revalidateIfStale))
        return revalidateIfStale;
      return true;
    })();
    const getSelectedCache = (state) => {
      const snapshot = mergeObjects(state);
      delete snapshot._k;
      if (!shouldStartRequest) {
        return snapshot;
      }
      return {
        isValidating: true,
        isLoading: true,
        ...snapshot
      };
    };
    const cachedData2 = getCache();
    const initialData = getInitialCache();
    const clientSnapshot = getSelectedCache(cachedData2);
    const serverSnapshot = cachedData2 === initialData ? clientSnapshot : getSelectedCache(initialData);
    let memorizedSnapshot = clientSnapshot;
    return [
      () => {
        const newSnapshot = getSelectedCache(getCache());
        const compareResult = isEqual(newSnapshot, memorizedSnapshot);
        if (compareResult) {
          memorizedSnapshot.data = newSnapshot.data;
          memorizedSnapshot.isLoading = newSnapshot.isLoading;
          memorizedSnapshot.isValidating = newSnapshot.isValidating;
          memorizedSnapshot.error = newSnapshot.error;
          return memorizedSnapshot;
        } else {
          memorizedSnapshot = newSnapshot;
          return newSnapshot;
        }
      },
      () => serverSnapshot
    ];
  }, [
    cache2,
    key
  ]);
  const cached = (0, import_shim.useSyncExternalStore)((0, import_react3.useCallback)(
    (callback) => subscribeCache(key, (current, prev) => {
      if (!isEqual(prev, current))
        callback();
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cache2,
      key
    ]
  ), getSnapshot[0], getSnapshot[1]);
  const isInitialMount = !initialMountedRef.current;
  const hasRevalidator = EVENT_REVALIDATORS[key] && EVENT_REVALIDATORS[key].length > 0;
  const cachedData = cached.data;
  const data = isUndefined(cachedData) ? fallback : cachedData;
  const error = cached.error;
  const laggyDataRef = (0, import_react3.useRef)(data);
  const returnedData = keepPreviousData ? isUndefined(cachedData) ? laggyDataRef.current : cachedData : data;
  const shouldDoInitialRevalidation = (() => {
    if (hasRevalidator && !isUndefined(error))
      return false;
    if (isInitialMount && !isUndefined(revalidateOnMount))
      return revalidateOnMount;
    if (getConfig().isPaused())
      return false;
    if (suspense)
      return isUndefined(data) ? false : revalidateIfStale;
    return isUndefined(data) || revalidateIfStale;
  })();
  const defaultValidatingState = !!(key && fetcher && isInitialMount && shouldDoInitialRevalidation);
  const isValidating = isUndefined(cached.isValidating) ? defaultValidatingState : cached.isValidating;
  const isLoading = isUndefined(cached.isLoading) ? defaultValidatingState : cached.isLoading;
  const revalidate = (0, import_react3.useCallback)(
    async (revalidateOpts) => {
      const currentFetcher = fetcherRef.current;
      if (!key || !currentFetcher || unmountedRef.current || getConfig().isPaused()) {
        return false;
      }
      let newData;
      let startAt;
      let loading = true;
      const opts = revalidateOpts || {};
      const shouldStartNewRequest = !FETCH[key] || !opts.dedupe;
      const callbackSafeguard = () => {
        if (IS_REACT_LEGACY) {
          return !unmountedRef.current && key === keyRef.current && initialMountedRef.current;
        }
        return key === keyRef.current;
      };
      const finalState = {
        isValidating: false,
        isLoading: false
      };
      const finishRequestAndUpdateState = () => {
        setCache(finalState);
      };
      const cleanupState = () => {
        const requestInfo = FETCH[key];
        if (requestInfo && requestInfo[1] === startAt) {
          delete FETCH[key];
        }
      };
      const initialState = {
        isValidating: true
      };
      if (isUndefined(getCache().data)) {
        initialState.isLoading = true;
      }
      try {
        if (shouldStartNewRequest) {
          setCache(initialState);
          if (config.loadingTimeout && isUndefined(getCache().data)) {
            setTimeout(() => {
              if (loading && callbackSafeguard()) {
                getConfig().onLoadingSlow(key, config);
              }
            }, config.loadingTimeout);
          }
          FETCH[key] = [
            currentFetcher(fnArg),
            getTimestamp()
          ];
        }
        [newData, startAt] = FETCH[key];
        newData = await newData;
        if (shouldStartNewRequest) {
          setTimeout(cleanupState, config.dedupingInterval);
        }
        if (!FETCH[key] || FETCH[key][1] !== startAt) {
          if (shouldStartNewRequest) {
            if (callbackSafeguard()) {
              getConfig().onDiscarded(key);
            }
          }
          return false;
        }
        finalState.error = UNDEFINED;
        const mutationInfo = MUTATION[key];
        if (!isUndefined(mutationInfo) && // case 1
        (startAt <= mutationInfo[0] || // case 2
        startAt <= mutationInfo[1] || // case 3
        mutationInfo[1] === 0)) {
          finishRequestAndUpdateState();
          if (shouldStartNewRequest) {
            if (callbackSafeguard()) {
              getConfig().onDiscarded(key);
            }
          }
          return false;
        }
        const cacheData = getCache().data;
        finalState.data = compare2(cacheData, newData) ? cacheData : newData;
        if (shouldStartNewRequest) {
          if (callbackSafeguard()) {
            getConfig().onSuccess(newData, key, config);
          }
        }
      } catch (err) {
        cleanupState();
        const currentConfig = getConfig();
        const { shouldRetryOnError } = currentConfig;
        if (!currentConfig.isPaused()) {
          finalState.error = err;
          if (shouldStartNewRequest && callbackSafeguard()) {
            currentConfig.onError(err, key, currentConfig);
            if (shouldRetryOnError === true || isFunction(shouldRetryOnError) && shouldRetryOnError(err)) {
              if (!getConfig().revalidateOnFocus || !getConfig().revalidateOnReconnect || isActive()) {
                currentConfig.onErrorRetry(err, key, currentConfig, (_opts) => {
                  const revalidators = EVENT_REVALIDATORS[key];
                  if (revalidators && revalidators[0]) {
                    revalidators[0](events.ERROR_REVALIDATE_EVENT, _opts);
                  }
                }, {
                  retryCount: (opts.retryCount || 0) + 1,
                  dedupe: true
                });
              }
            }
          }
        }
      }
      loading = false;
      finishRequestAndUpdateState();
      return true;
    },
    // `setState` is immutable, and `eventsCallback`, `fnArg`, and
    // `keyValidating` are depending on `key`, so we can exclude them from
    // the deps array.
    //
    // FIXME:
    // `fn` and `config` might be changed during the lifecycle,
    // but they might be changed every render like this.
    // `useSWR('key', () => fetch('/api/'), { suspense: true })`
    // So we omit the values from the deps array
    // even though it might cause unexpected behaviors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      key,
      cache2
    ]
  );
  const boundMutate = (0, import_react3.useCallback)(
    // Use callback to make sure `keyRef.current` returns latest result every time
    (...args) => {
      return internalMutate(cache2, keyRef.current, ...args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useIsomorphicLayoutEffect(() => {
    fetcherRef.current = fetcher;
    configRef.current = config;
    if (!isUndefined(cachedData)) {
      laggyDataRef.current = cachedData;
    }
  });
  useIsomorphicLayoutEffect(() => {
    if (!key)
      return;
    const softRevalidate = revalidate.bind(UNDEFINED, WITH_DEDUPE);
    let nextFocusRevalidatedAt = 0;
    const onRevalidate = (type, opts = {}) => {
      if (type == events.FOCUS_EVENT) {
        const now = Date.now();
        if (getConfig().revalidateOnFocus && now > nextFocusRevalidatedAt && isActive()) {
          nextFocusRevalidatedAt = now + getConfig().focusThrottleInterval;
          softRevalidate();
        }
      } else if (type == events.RECONNECT_EVENT) {
        if (getConfig().revalidateOnReconnect && isActive()) {
          softRevalidate();
        }
      } else if (type == events.MUTATE_EVENT) {
        return revalidate();
      } else if (type == events.ERROR_REVALIDATE_EVENT) {
        return revalidate(opts);
      }
      return;
    };
    const unsubEvents = subscribeCallback(key, EVENT_REVALIDATORS, onRevalidate);
    unmountedRef.current = false;
    keyRef.current = key;
    initialMountedRef.current = true;
    setCache({
      _k: fnArg
    });
    if (shouldDoInitialRevalidation) {
      if (isUndefined(data) || IS_SERVER) {
        softRevalidate();
      } else {
        rAF(softRevalidate);
      }
    }
    return () => {
      unmountedRef.current = true;
      unsubEvents();
    };
  }, [
    key
  ]);
  useIsomorphicLayoutEffect(() => {
    let timer;
    function next() {
      const interval = isFunction(refreshInterval) ? refreshInterval(getCache().data) : refreshInterval;
      if (interval && timer !== -1) {
        timer = setTimeout(execute, interval);
      }
    }
    function execute() {
      if (!getCache().error && (refreshWhenHidden || getConfig().isVisible()) && (refreshWhenOffline || getConfig().isOnline())) {
        revalidate(WITH_DEDUPE).then(next);
      } else {
        next();
      }
    }
    next();
    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = -1;
      }
    };
  }, [
    refreshInterval,
    refreshWhenHidden,
    refreshWhenOffline,
    key
  ]);
  (0, import_react3.useDebugValue)(returnedData);
  if (suspense && isUndefined(data) && key) {
    if (!IS_REACT_LEGACY && IS_SERVER) {
      throw new Error("Fallback data is required when using suspense in SSR.");
    }
    fetcherRef.current = fetcher;
    configRef.current = config;
    unmountedRef.current = false;
    const req = PRELOAD[key];
    if (!isUndefined(req)) {
      const promise = boundMutate(req);
      use2(promise);
    }
    if (isUndefined(error)) {
      const promise = revalidate(WITH_DEDUPE);
      if (!isUndefined(returnedData)) {
        promise.status = "fulfilled";
        promise.value = true;
      }
      use2(promise);
    } else {
      throw error;
    }
  }
  return {
    mutate: boundMutate,
    get data() {
      stateDependencies.data = true;
      return returnedData;
    },
    get error() {
      stateDependencies.error = true;
      return error;
    },
    get isValidating() {
      stateDependencies.isValidating = true;
      return isValidating;
    },
    get isLoading() {
      stateDependencies.isLoading = true;
      return isLoading;
    }
  };
};
var SWRConfig2 = OBJECT.defineProperty(SWRConfig, "defaultValue", {
  value: defaultConfig
});
var useSWR = withArgs(useSWRHandler);

// app/routes/app.assistants.$id.$threadId/previous-messages.tsx
var import_jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants.$id.$threadId/previous-messages.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
var _s22 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants.$id.$threadId/previous-messages.tsx"
  );
  import.meta.hot.lastModified = "1709234704774.7627";
}
function PreviousMessages({
  lastId,
  assistantName,
  onLoadMore,
  hideLoadMore
}) {
  _s2();
  const params = useParams();
  const assistantId = params.id;
  const threadId = params.threadId;
  const url = `/app/assistants/${assistantId}/${threadId}/${lastId}`;
  const {
    data,
    error,
    isLoading
  } = useSWR(url, () => fetch(url).then((res) => res.json()));
  const hasMore = data?.body.has_more;
  const nextLastId = data?.body.last_id;
  if (error)
    return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: "failed to load previous messages" }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 47,
      columnNumber: 21
    }, this);
  if (isLoading)
    return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: "loading..." }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 48,
      columnNumber: 25
    }, this);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(import_jsx_dev_runtime3.Fragment, { children: [
    hasMore && !hideLoadMore ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(LoadMoreButton, { onClick: () => onLoadMore({
      lastId: nextLastId
    }) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 50,
      columnNumber: 32
    }, this) : null,
    data?.data.map((message) => {
      const isUser = message.role === "user";
      const text = message.content.find((ct) => ct.type === "text")?.text.value;
      if (!isUser && !text?.length) {
        return null;
      }
      return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Message, { isUser, assistantName, children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { children: text }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
        lineNumber: 60,
        columnNumber: 7
      }, this) }, message.id, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
        lineNumber: 59,
        columnNumber: 14
      }, this);
    })
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
    lineNumber: 49,
    columnNumber: 10
  }, this);
}
_s2(PreviousMessages, "DkGpiZnZocNM2iAPqM0dMHbLxxs=", false, function() {
  return [useParams, useSWR];
});
_c3 = PreviousMessages;
var LoadMoreButton = (props) => /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex w-full justify-center", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Button, { variant: "secondary", ...props, children: "Load more" }, void 0, false, {
  fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
  lineNumber: 70,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
  lineNumber: 69,
  columnNumber: 40
}, this);
_c22 = LoadMoreButton;
var Message = ({
  isUser,
  children,
  assistantName
}) => {
  _s22();
  const user = useUser();
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "p-4", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "mx-auto flex max-w-[700px] gap-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: isUser ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("img", { src: getUserImgSrc(user.image?.id), alt: user.name ?? user.email, className: "h-8 w-8 min-w-8 rounded-full object-cover" }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 85,
      columnNumber: 16
    }, this) : /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "flex items-center justify-center rounded-full bg-primary/50 p-2", children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(AssistantIcon, {}, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 86,
      columnNumber: 8
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 85,
      columnNumber: 146
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 84,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: "w-full", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("h4", { children: isUser ? user.name : assistantName }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
        lineNumber: 90,
        columnNumber: 6
      }, this),
      children
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
      lineNumber: 89,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
    lineNumber: 83,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/routes/app.assistants.$id.$threadId/previous-messages.tsx",
    lineNumber: 82,
    columnNumber: 10
  }, this);
};
_s22(Message, "BPnln+wUpxLjLAxQmw7xYz9C+QI=", false, function() {
  return [useUser];
});
_c32 = Message;
var _c3;
var _c22;
var _c32;
$RefreshReg$(_c3, "PreviousMessages");
$RefreshReg$(_c22, "LoadMoreButton");
$RefreshReg$(_c32, "Message");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.assistants.$id.$threadId/route.tsx
var import_jsx_dev_runtime4 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.assistants.$id.$threadId/route.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.assistants.$id.$threadId/route.tsx"
  );
  import.meta.hot.lastModified = "1709234694074.1477";
}
var Schema = z.object({
  response: z.string(),
  isPoll: z.string().optional()
});
function Route() {
  _s3();
  const {
    assistant,
    messages,
    latestRun
  } = useLoaderData();
  const loaderFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const optimisticResponse = actionFetcher.formData?.get("response");
  const params = useParams();
  const [previous, setPrevious] = (0, import_react7.useState)([]);
  const messagesRef = (0, import_react7.useRef)(null);
  const [actionForm, actionFields] = useForm({
    id: "thread-response-form",
    lastResult: actionFetcher.data,
    constraint: getZodConstraint(Schema)
  });
  (0, import_react7.useEffect)(() => {
    if (latestRun.status === "in_progress") {
      const timeout = setTimeout(() => {
        const formData = new FormData();
        formData.append("isPoll", "true");
        formData.append("response", "<polling>");
        actionFetcher.submit(formData, {
          method: "POST"
        });
      }, 2e3);
      return () => clearTimeout(timeout);
    }
  }, [actionFetcher, latestRun.status]);
  (0, import_react7.useEffect)(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("main", { className: "flex max-h-screen min-h-screen w-full flex-col pb-6", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "h-screen overflow-scroll pb-6 pt-16 sm:h-[calc(100vh-90px)]", ref: messagesRef, children: [
      params.threadId ? previous.reverse().map(({
        lastId
      }, index) => /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(PreviousMessages, { lastId, assistantName: assistant.name, onLoadMore: (value) => setPrevious((p) => p.concat(value)), hideLoadMore: index !== 0 }, lastId, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 149,
        columnNumber: 20
      }, this)) : null,
      messages.hasMore && messages.lastId && !previous.length ? /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(LoadMoreButton, { onClick: () => setPrevious((p) => p.concat({
        lastId: messages.lastId
      })) }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 150,
        columnNumber: 64
      }, this) : null,
      messages.data.map((message) => {
        const isUser = message.role === "user";
        const text = message.content.find((ct) => ct.type === "text")?.text.value;
        if (!isUser && !text?.length) {
          return null;
        }
        return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Message, { isUser, assistantName: assistant.name, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("p", { children: text }, void 0, false, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 160,
          columnNumber: 8
        }, this) }, message.id, false, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 159,
          columnNumber: 16
        }, this);
      }),
      optimisticResponse && optimisticResponse !== "<polling>" ? /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Message, { isUser: true, assistantName: assistant.name, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("p", { children: optimisticResponse.toString() }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 164,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 163,
        columnNumber: 65
      }, this) : null,
      /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(loaderFetcher.Form, { children: latestRun.status === "in_progress" ? /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Message, { isUser: false, assistantName: assistant.name, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "grid w-full gap-2 pt-1", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "flex w-full gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Skeleton, { className: "h-4 w-1/4 rounded-sm bg-foreground/10" }, void 0, false, {
            fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
            lineNumber: 170,
            columnNumber: 10
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Skeleton, { className: "h-4 w-1/4 rounded-sm bg-foreground/10" }, void 0, false, {
            fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
            lineNumber: 171,
            columnNumber: 10
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 169,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Skeleton, { className: "h-4 w-2/3 rounded-sm bg-foreground/10" }, void 0, false, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 173,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 168,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 167,
        columnNumber: 44
      }, this) : latestRun.failed_at || latestRun.cancelled_at ? /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Message, { isUser: false, assistantName: assistant.name, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "flex w-full items-center justify-between rounded-lg border border-destructive bg-destructive/15 p-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("p", { className: "pl-2", children: "Something went wrong." }, void 0, false, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 177,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Button, { type: "submit", variant: "destructive", size: "sm", children: "Try again" }, void 0, false, {
          fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
          lineNumber: 178,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 176,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 175,
        columnNumber: 68
      }, this) : null }, void 0, false, {
        fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
        lineNumber: 166,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
      lineNumber: 146,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)("div", { className: "flex w-full items-center justify-center px-3", children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(actionFetcher.Form, { method: "POST", ...getFormProps(actionForm), className: "w-full", children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(ChatInput, { textareaProps: {
      ...getInputProps(actionFields.response, {
        type: "text"
      })
    }, onSubmit: actionFetcher.submit }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
      lineNumber: 187,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
      lineNumber: 186,
      columnNumber: 5
    }, this) }, void 0, false, {
      fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
      lineNumber: 185,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
    lineNumber: 145,
    columnNumber: 10
  }, this);
}
_s3(Route, "YM0flCXZq9XwNrTs3vEEGRFVCP8=", false, function() {
  return [useLoaderData, useFetcher, useFetcher, useParams, useForm];
});
_c4 = Route;
function ErrorBoundary() {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(GeneralErrorBoundary, {}, void 0, false, {
    fileName: "app/routes/app.assistants.$id.$threadId/route.tsx",
    lineNumber: 201,
    columnNumber: 10
  }, this);
}
_c23 = ErrorBoundary;
var _c4;
var _c23;
$RefreshReg$(_c4, "Route");
$RefreshReg$(_c23, "ErrorBoundary");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
export {
  ErrorBoundary,
  Route as default
};
//# sourceMappingURL=/build/routes/app.assistants.$id.$threadId/route-WIINICKN.js.map
