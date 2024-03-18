import {
  $d7bdfb9eb0fdf311$export$6d08773d2e66f8f2,
  $d7bdfb9eb0fdf311$export$be92b6f5f03c0fe9,
  $d7bdfb9eb0fdf311$export$c7109489551a4f4,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "/build/_shared/chunk-CJCTI75V.js";
import {
  v4_default
} from "/build/_shared/chunk-EABXFNCQ.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "/build/_shared/chunk-FAKZQ2FT.js";
import {
  $5d3850c4d0b4e6c7$export$393edc798c47379d,
  $5d3850c4d0b4e6c7$export$41fb9f06171c75f4,
  $5d3850c4d0b4e6c7$export$602eac185826482c,
  $5d3850c4d0b4e6c7$export$7c6e2c02157bb7d2,
  $5d3850c4d0b4e6c7$export$be92b6f5f03c0fe9,
  $5d3850c4d0b4e6c7$export$c6fdb837b070b4ff,
  $5d3850c4d0b4e6c7$export$f39c2d165cd861fe,
  $5d3850c4d0b4e6c7$export$f99233281efd08a0
} from "/build/_shared/chunk-TEC46UIB.js";
import {
  Textarea
} from "/build/_shared/chunk-PSDSLUED.js";
import {
  require_shim
} from "/build/_shared/chunk-44XBEHAJ.js";
import {
  startCase
} from "/build/_shared/chunk-M2JRAUR6.js";
import {
  $f631663db3294ace$export$b39126d51d94e6f3
} from "/build/_shared/chunk-DXKYUF2Y.js";
import {
  $010c2913dbd2fe3d$export$5cae361ad82dce8b
} from "/build/_shared/chunk-XFJ7VQR3.js";
import {
  Input
} from "/build/_shared/chunk-FOFHSXAQ.js";
import {
  ErrorList
} from "/build/_shared/chunk-TATQ6JRM.js";
import {
  $db6c3485150b8e66$export$1ab7ae714698c4b8,
  Tooltip
} from "/build/_shared/chunk-2IBZX4VF.js";
import {
  $71cd76cc60e0454e$export$6f32135080cb4c3,
  $8927f6f2acc4f386$export$250ffa63cdc0d034,
  $921a889cee6df7e8$export$99c2b779aa4e8b8b,
  $c512c27ab02ef895$export$50c7b4e9d9f19c1,
  $e42e1063c40fb3ef$export$b9ecd428b558ff10
} from "/build/_shared/chunk-36KFBUOH.js";
import {
  require_jsx_runtime
} from "/build/_shared/chunk-NMZL6IDN.js";
import {
  ZodType,
  z
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  Button,
  Check,
  ChevronsUpDown,
  Circle,
  X
} from "/build/_shared/chunk-YMX4THL4.js";
import {
  $6ed0406888f73fc4$export$c7b2cbe3552a0d05,
  _extends,
  cva
} from "/build/_shared/chunk-4ODUPV53.js";
import {
  DotsVerticalIcon,
  InfoCircledIcon
} from "/build/_shared/chunk-2IBK7TCH.js";
import {
  cn
} from "/build/_shared/chunk-AL45ADJZ.js";
import {
  require_jsx_dev_runtime
} from "/build/_shared/chunk-XU7DNSPJ.js";
import {
  Form,
  useActionData,
  useMatches,
  useNavigation,
  useSubmit
} from "/build/_shared/chunk-RGUMUN57.js";
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

// node_modules/lodash.get/index.js
var require_lodash = __commonJS({
  "node_modules/lodash.get/index.js"(exports, module) {
    var FUNC_ERROR_TEXT = "Expected a function";
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var INFINITY = 1 / 0;
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var symbolTag = "[object Symbol]";
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    var reLeadingDot = /^\./;
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reEscapeChar = /\\(\\)?/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var freeGlobal = typeof globalThis == "object" && globalThis && globalThis.Object === Object && globalThis;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var maskSrcKey = function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    }();
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Symbol2 = root.Symbol;
    var splice = arrayProto.splice;
    var Map2 = getNative(root, "Map");
    var nativeCreate = getNative(Object, "create");
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function Hash(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
    }
    function hashDelete(key) {
      return this.has(key) && delete this.__data__[key];
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      return getMapData(this, key)["delete"](key);
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      getMapData(this, key).set(key, value);
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseGet(object, path) {
      path = isKey(path, object) ? [path] : castPath(path);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function castPath(value) {
      return isArray2(value) ? value : stringToPath(value);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    function isKey(value, object) {
      if (isArray2(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    var stringToPath = memoize(function(string) {
      string = toString(string);
      var result = [];
      if (reLeadingDot.test(string)) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, string2) {
        result.push(quote ? string2.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function memoize(func, resolver) {
      if (typeof func != "function" || resolver && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
        if (cache.has(key)) {
          return cache.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache.set(key, result);
        return result;
      };
      memoized.cache = new (memoize.Cache || MapCache)();
      return memoized;
    }
    memoize.Cache = MapCache;
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    var isArray2 = Array.isArray;
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    function get2(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get2;
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js
var require_with_selector_development = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js"(exports) {
    "use strict";
    if (true) {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var React5 = require_react();
        var shim = require_shim();
        function is(x2, y2) {
          return x2 === y2 && (x2 !== 0 || 1 / x2 === 1 / y2) || x2 !== x2 && y2 !== y2;
        }
        var objectIs = typeof Object.is === "function" ? Object.is : is;
        var useSyncExternalStore = shim.useSyncExternalStore;
        var useRef7 = React5.useRef, useEffect8 = React5.useEffect, useMemo6 = React5.useMemo, useDebugValue2 = React5.useDebugValue;
        function useSyncExternalStoreWithSelector2(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
          var instRef = useRef7(null);
          var inst;
          if (instRef.current === null) {
            inst = {
              hasValue: false,
              value: null
            };
            instRef.current = inst;
          } else {
            inst = instRef.current;
          }
          var _useMemo = useMemo6(function() {
            var hasMemo = false;
            var memoizedSnapshot;
            var memoizedSelection;
            var memoizedSelector = function(nextSnapshot) {
              if (!hasMemo) {
                hasMemo = true;
                memoizedSnapshot = nextSnapshot;
                var _nextSelection = selector(nextSnapshot);
                if (isEqual !== void 0) {
                  if (inst.hasValue) {
                    var currentSelection = inst.value;
                    if (isEqual(currentSelection, _nextSelection)) {
                      memoizedSelection = currentSelection;
                      return currentSelection;
                    }
                  }
                }
                memoizedSelection = _nextSelection;
                return _nextSelection;
              }
              var prevSnapshot = memoizedSnapshot;
              var prevSelection = memoizedSelection;
              if (objectIs(prevSnapshot, nextSnapshot)) {
                return prevSelection;
              }
              var nextSelection = selector(nextSnapshot);
              if (isEqual !== void 0 && isEqual(prevSelection, nextSelection)) {
                return prevSelection;
              }
              memoizedSnapshot = nextSnapshot;
              memoizedSelection = nextSelection;
              return nextSelection;
            };
            var maybeGetServerSnapshot = getServerSnapshot === void 0 ? null : getServerSnapshot;
            var getSnapshotWithSelector = function() {
              return memoizedSelector(getSnapshot());
            };
            var getServerSnapshotWithSelector = maybeGetServerSnapshot === null ? void 0 : function() {
              return memoizedSelector(maybeGetServerSnapshot());
            };
            return [getSnapshotWithSelector, getServerSnapshotWithSelector];
          }, [getSnapshot, getServerSnapshot, selector, isEqual]), getSelection = _useMemo[0], getServerSelection = _useMemo[1];
          var value = useSyncExternalStore(subscribe, getSelection, getServerSelection);
          useEffect8(function() {
            inst.hasValue = true;
            inst.value = value;
          }, [value]);
          useDebugValue2(value);
          return value;
        }
        exports.useSyncExternalStoreWithSelector = useSyncExternalStoreWithSelector2;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// node_modules/use-sync-external-store/shim/with-selector.js
var require_with_selector = __commonJS({
  "node_modules/use-sync-external-store/shim/with-selector.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_with_selector_development();
    }
  }
});

// node_modules/remix-validated-form/dist/index.esm.js
var import_react2 = __toESM(require_react());

// node_modules/remeda/dist/es/purry.js
var __spreadArray = function(to, from2, pack) {
  if (pack || arguments.length === 2)
    for (var i2 = 0, l2 = from2.length, ar; i2 < l2; i2++) {
      if (ar || !(i2 in from2)) {
        if (!ar)
          ar = Array.prototype.slice.call(from2, 0, i2);
        ar[i2] = from2[i2];
      }
    }
  return to.concat(ar || Array.prototype.slice.call(from2));
};
function purry(fn2, args, lazyFactory) {
  var callArgs = Array.from(args);
  var diff = fn2.length - args.length;
  if (diff === 0) {
    return fn2.apply(void 0, callArgs);
  }
  if (diff === 1) {
    var ret = function(data) {
      return fn2.apply(void 0, __spreadArray([data], callArgs, false));
    };
    var lazy = lazyFactory !== null && lazyFactory !== void 0 ? lazyFactory : fn2.lazy;
    return lazy === void 0 ? ret : Object.assign(ret, { lazy, lazyArgs: args });
  }
  throw new Error("Wrong number of arguments");
}

// node_modules/remeda/dist/es/_reduceLazy.js
function _reduceLazy(array, lazy, isIndexed) {
  if (isIndexed === void 0) {
    isIndexed = false;
  }
  var out = [];
  for (var index = 0; index < array.length; index++) {
    var item = array[index];
    var result = isIndexed ? lazy(item, index, array) : lazy(item);
    if (result.hasMany === true) {
      out.push.apply(out, result.next);
    } else if (result.hasNext) {
      out.push(result.next);
    }
    if (result.done) {
      break;
    }
  }
  return out;
}

// node_modules/remeda/dist/es/hasAtLeast.js
function hasAtLeast() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  return purry(hasAtLeastImplementation, args);
}
var hasAtLeastImplementation = function(data, minimum) {
  return data.length >= minimum;
};

// node_modules/remeda/dist/es/equals.js
function equals() {
  return purry(_equals, arguments);
}
function _equals(a2, b2) {
  if (a2 === b2) {
    return true;
  }
  if (typeof a2 === "number" && typeof b2 === "number") {
    return a2 !== a2 && b2 !== b2;
  }
  if (typeof a2 !== "object" || typeof b2 !== "object") {
    return false;
  }
  if (a2 === null || b2 === null) {
    return false;
  }
  var isArrayA = Array.isArray(a2);
  var isArrayB = Array.isArray(b2);
  if (isArrayA && isArrayB) {
    if (a2.length !== b2.length) {
      return false;
    }
    for (var i2 = 0; i2 < a2.length; i2++) {
      if (!_equals(a2[i2], b2[i2])) {
        return false;
      }
    }
    return true;
  }
  if (isArrayA !== isArrayB) {
    return false;
  }
  var isDateA = a2 instanceof Date;
  var isDateB = b2 instanceof Date;
  if (isDateA && isDateB) {
    return a2.getTime() === b2.getTime();
  }
  if (isDateA !== isDateB) {
    return false;
  }
  var isRegExpA = a2 instanceof RegExp;
  var isRegExpB = b2 instanceof RegExp;
  if (isRegExpA && isRegExpB) {
    return a2.toString() === b2.toString();
  }
  if (isRegExpA !== isRegExpB) {
    return false;
  }
  var keys2 = Object.keys(a2);
  if (keys2.length !== Object.keys(b2).length) {
    return false;
  }
  for (var _i = 0, keys_1 = keys2; _i < keys_1.length; _i++) {
    var key = keys_1[_i];
    if (!Object.prototype.hasOwnProperty.call(b2, key)) {
      return false;
    }
    if (!_equals(a2[key], b2[key])) {
      return false;
    }
  }
  return true;
}

// node_modules/remeda/dist/es/fromPairs.js
function fromPairs() {
  return purry(fromPairsImplementation, arguments);
}
function fromPairsImplementation(entries2) {
  var out = {};
  for (var _i = 0, entries_1 = entries2; _i < entries_1.length; _i++) {
    var _a = entries_1[_i], key = _a[0], value = _a[1];
    out[key] = value;
  }
  return out;
}
(function(fromPairs2) {
  fromPairs2.strict = fromPairs2;
})(fromPairs || (fromPairs = {}));

// node_modules/remeda/dist/es/keys.js
function keys() {
  return purry(Object.keys, arguments);
}
(function(keys2) {
  keys2.strict = keys2;
})(keys || (keys = {}));

// node_modules/remeda/dist/es/omit.js
var __assign = function() {
  __assign = Object.assign || function(t2) {
    for (var s2, i2 = 1, n2 = arguments.length; i2 < n2; i2++) {
      s2 = arguments[i2];
      for (var p2 in s2)
        if (Object.prototype.hasOwnProperty.call(s2, p2))
          t2[p2] = s2[p2];
    }
    return t2;
  };
  return __assign.apply(this, arguments);
};
var __rest = function(s2, e) {
  var t2 = {};
  for (var p2 in s2)
    if (Object.prototype.hasOwnProperty.call(s2, p2) && e.indexOf(p2) < 0)
      t2[p2] = s2[p2];
  if (s2 != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i2 = 0, p2 = Object.getOwnPropertySymbols(s2); i2 < p2.length; i2++) {
      if (e.indexOf(p2[i2]) < 0 && Object.prototype.propertyIsEnumerable.call(s2, p2[i2]))
        t2[p2[i2]] = s2[p2[i2]];
    }
  return t2;
};
function omit() {
  return purry(_omit, arguments);
}
function _omit(data, propNames) {
  if (!hasAtLeast(propNames, 1)) {
    return __assign({}, data);
  }
  if (!hasAtLeast(propNames, 2)) {
    var propName = propNames[0];
    var _a = data, _b = propName, omitted = _a[_b], remaining = __rest(_a, [typeof _b === "symbol" ? _b : _b + ""]);
    return remaining;
  }
  if (!propNames.some(function(propName2) {
    return propName2 in data;
  })) {
    return __assign({}, data);
  }
  var asSet = new Set(propNames);
  return fromPairs(Object.entries(data).filter(function(_a2) {
    var key = _a2[0];
    return !asSet.has(key);
  }));
}

// node_modules/remeda/dist/es/omitBy.js
function omitBy() {
  return purry(_omitBy, arguments);
}
function _omitBy(object, fn2) {
  if (object === void 0 || object === null) {
    return object;
  }
  var out = {};
  for (var _i = 0, _a = keys.strict(object); _i < _a.length; _i++) {
    var key = _a[_i];
    if (!fn2(object[key], key)) {
      out[key] = object[key];
    }
  }
  return out;
}

// node_modules/remeda/dist/es/uniq.js
function uniq() {
  return purry(_uniq, arguments, uniq.lazy);
}
function _uniq(array) {
  return _reduceLazy(array, uniq.lazy());
}
(function(uniq2) {
  function lazy() {
    var set = /* @__PURE__ */ new Set();
    return function(value) {
      if (set.has(value)) {
        return { done: false, hasNext: false };
      }
      set.add(value);
      return { done: false, hasNext: true, next: value };
    };
  }
  uniq2.lazy = lazy;
})(uniq || (uniq = {}));

// node_modules/remix-validated-form/dist/index.esm.js
var import_react4 = __toESM(require_react());
var import_lodash = __toESM(require_lodash());

// node_modules/tiny-invariant/dist/esm/tiny-invariant.js
var isProduction = false;
var prefix = "Invariant failed";
function invariant(condition, message) {
  if (condition) {
    return;
  }
  if (isProduction) {
    throw new Error(prefix);
  }
  var provided = typeof message === "function" ? message() : message;
  var value = provided ? "".concat(prefix, ": ").concat(provided) : prefix;
  throw new Error(value);
}

// node_modules/remix-validated-form/dist/index.esm.js
var import_react5 = __toESM(require_react());

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace3) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace3 != null ? replace3 : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const destroy = () => {
    if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production") {
      console.warn(
        "[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."
      );
    }
    listeners.clear();
  };
  const api = { setState, getState, getInitialState, subscribe, destroy };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/index.mjs
var import_react = __toESM(require_react(), 1);
var import_with_selector = __toESM(require_with_selector(), 1);
var { useDebugValue } = import_react.default;
var { useSyncExternalStoreWithSelector } = import_with_selector.default;
var didWarnAboutEqualityFn = false;
var identity = (arg) => arg;
function useStore(api, selector = identity, equalityFn) {
  if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && equalityFn && !didWarnAboutEqualityFn) {
    console.warn(
      "[DEPRECATED] Use `createWithEqualityFn` instead of `create` or use `useStoreWithEqualityFn` instead of `useStore`. They can be imported from 'zustand/traditional'. https://github.com/pmndrs/zustand/discussions/1937"
    );
    didWarnAboutEqualityFn = true;
  }
  const slice = useSyncExternalStoreWithSelector(
    api.subscribe,
    api.getState,
    api.getServerState || api.getInitialState,
    selector,
    equalityFn
  );
  useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  if ((import.meta.env ? import.meta.env.MODE : void 0) !== "production" && typeof createState !== "function") {
    console.warn(
      "[DEPRECATED] Passing a vanilla store will be unsupported in a future version. Instead use `import { useStore } from 'zustand'`."
    );
  }
  const api = typeof createState === "function" ? createStore(createState) : createState;
  const useBoundStore = (selector, equalityFn) => useStore(api, selector, equalityFn);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// node_modules/immer/dist/immer.esm.mjs
function n(n2) {
  for (var r2 = arguments.length, t2 = Array(r2 > 1 ? r2 - 1 : 0), e = 1; e < r2; e++)
    t2[e - 1] = arguments[e];
  if (true) {
    var i2 = Y[n2], o2 = i2 ? "function" == typeof i2 ? i2.apply(null, t2) : i2 : "unknown error nr: " + n2;
    throw Error("[Immer] " + o2);
  }
  throw Error("[Immer] minified error nr: " + n2 + (t2.length ? " " + t2.map(function(n3) {
    return "'" + n3 + "'";
  }).join(",") : "") + ". Find the full error at: https://bit.ly/3cXEKWf");
}
function r(n2) {
  return !!n2 && !!n2[Q];
}
function t(n2) {
  var r2;
  return !!n2 && (function(n3) {
    if (!n3 || "object" != typeof n3)
      return false;
    var r3 = Object.getPrototypeOf(n3);
    if (null === r3)
      return true;
    var t2 = Object.hasOwnProperty.call(r3, "constructor") && r3.constructor;
    return t2 === Object || "function" == typeof t2 && Function.toString.call(t2) === Z;
  }(n2) || Array.isArray(n2) || !!n2[L] || !!(null === (r2 = n2.constructor) || void 0 === r2 ? void 0 : r2[L]) || s(n2) || v(n2));
}
function i(n2, r2, t2) {
  void 0 === t2 && (t2 = false), 0 === o(n2) ? (t2 ? Object.keys : nn)(n2).forEach(function(e) {
    t2 && "symbol" == typeof e || r2(e, n2[e], n2);
  }) : n2.forEach(function(t3, e) {
    return r2(e, t3, n2);
  });
}
function o(n2) {
  var r2 = n2[Q];
  return r2 ? r2.i > 3 ? r2.i - 4 : r2.i : Array.isArray(n2) ? 1 : s(n2) ? 2 : v(n2) ? 3 : 0;
}
function u(n2, r2) {
  return 2 === o(n2) ? n2.has(r2) : Object.prototype.hasOwnProperty.call(n2, r2);
}
function a(n2, r2) {
  return 2 === o(n2) ? n2.get(r2) : n2[r2];
}
function f(n2, r2, t2) {
  var e = o(n2);
  2 === e ? n2.set(r2, t2) : 3 === e ? n2.add(t2) : n2[r2] = t2;
}
function c(n2, r2) {
  return n2 === r2 ? 0 !== n2 || 1 / n2 == 1 / r2 : n2 != n2 && r2 != r2;
}
function s(n2) {
  return X2 && n2 instanceof Map;
}
function v(n2) {
  return q && n2 instanceof Set;
}
function p(n2) {
  return n2.o || n2.t;
}
function l(n2) {
  if (Array.isArray(n2))
    return Array.prototype.slice.call(n2);
  var r2 = rn(n2);
  delete r2[Q];
  for (var t2 = nn(r2), e = 0; e < t2.length; e++) {
    var i2 = t2[e], o2 = r2[i2];
    false === o2.writable && (o2.writable = true, o2.configurable = true), (o2.get || o2.set) && (r2[i2] = { configurable: true, writable: true, enumerable: o2.enumerable, value: n2[i2] });
  }
  return Object.create(Object.getPrototypeOf(n2), r2);
}
function d(n2, e) {
  return void 0 === e && (e = false), y(n2) || r(n2) || !t(n2) || (o(n2) > 1 && (n2.set = n2.add = n2.clear = n2.delete = h), Object.freeze(n2), e && i(n2, function(n3, r2) {
    return d(r2, true);
  }, true)), n2;
}
function h() {
  n(2);
}
function y(n2) {
  return null == n2 || "object" != typeof n2 || Object.isFrozen(n2);
}
function b(r2) {
  var t2 = tn[r2];
  return t2 || n(18, r2), t2;
}
function _() {
  return U || n(0), U;
}
function j(n2, r2) {
  r2 && (b("Patches"), n2.u = [], n2.s = [], n2.v = r2);
}
function g(n2) {
  O(n2), n2.p.forEach(S), n2.p = null;
}
function O(n2) {
  n2 === U && (U = n2.l);
}
function w(n2) {
  return U = { p: [], l: U, h: n2, m: true, _: 0 };
}
function S(n2) {
  var r2 = n2[Q];
  0 === r2.i || 1 === r2.i ? r2.j() : r2.g = true;
}
function P(r2, e) {
  e._ = e.p.length;
  var i2 = e.p[0], o2 = void 0 !== r2 && r2 !== i2;
  return e.h.O || b("ES5").S(e, r2, o2), o2 ? (i2[Q].P && (g(e), n(4)), t(r2) && (r2 = M(e, r2), e.l || x(e, r2)), e.u && b("Patches").M(i2[Q].t, r2, e.u, e.s)) : r2 = M(e, i2, []), g(e), e.u && e.v(e.u, e.s), r2 !== H ? r2 : void 0;
}
function M(n2, r2, t2) {
  if (y(r2))
    return r2;
  var e = r2[Q];
  if (!e)
    return i(r2, function(i2, o3) {
      return A(n2, e, r2, i2, o3, t2);
    }, true), r2;
  if (e.A !== n2)
    return r2;
  if (!e.P)
    return x(n2, e.t, true), e.t;
  if (!e.I) {
    e.I = true, e.A._--;
    var o2 = 4 === e.i || 5 === e.i ? e.o = l(e.k) : e.o, u2 = o2, a2 = false;
    3 === e.i && (u2 = new Set(o2), o2.clear(), a2 = true), i(u2, function(r3, i2) {
      return A(n2, e, o2, r3, i2, t2, a2);
    }), x(n2, o2, false), t2 && n2.u && b("Patches").N(e, t2, n2.u, n2.s);
  }
  return e.o;
}
function A(e, i2, o2, a2, c2, s2, v2) {
  if (c2 === o2 && n(5), r(c2)) {
    var p2 = M(e, c2, s2 && i2 && 3 !== i2.i && !u(i2.R, a2) ? s2.concat(a2) : void 0);
    if (f(o2, a2, p2), !r(p2))
      return;
    e.m = false;
  } else
    v2 && o2.add(c2);
  if (t(c2) && !y(c2)) {
    if (!e.h.D && e._ < 1)
      return;
    M(e, c2), i2 && i2.A.l || x(e, c2);
  }
}
function x(n2, r2, t2) {
  void 0 === t2 && (t2 = false), !n2.l && n2.h.D && n2.m && d(r2, t2);
}
function z2(n2, r2) {
  var t2 = n2[Q];
  return (t2 ? p(t2) : n2)[r2];
}
function I(n2, r2) {
  if (r2 in n2)
    for (var t2 = Object.getPrototypeOf(n2); t2; ) {
      var e = Object.getOwnPropertyDescriptor(t2, r2);
      if (e)
        return e;
      t2 = Object.getPrototypeOf(t2);
    }
}
function k(n2) {
  n2.P || (n2.P = true, n2.l && k(n2.l));
}
function E(n2) {
  n2.o || (n2.o = l(n2.t));
}
function N(n2, r2, t2) {
  var e = s(r2) ? b("MapSet").F(r2, t2) : v(r2) ? b("MapSet").T(r2, t2) : n2.O ? function(n3, r3) {
    var t3 = Array.isArray(n3), e2 = { i: t3 ? 1 : 0, A: r3 ? r3.A : _(), P: false, I: false, R: {}, l: r3, t: n3, k: null, o: null, j: null, C: false }, i2 = e2, o2 = en;
    t3 && (i2 = [e2], o2 = on);
    var u2 = Proxy.revocable(i2, o2), a2 = u2.revoke, f2 = u2.proxy;
    return e2.k = f2, e2.j = a2, f2;
  }(r2, t2) : b("ES5").J(r2, t2);
  return (t2 ? t2.A : _()).p.push(e), e;
}
function R(e) {
  return r(e) || n(22, e), function n2(r2) {
    if (!t(r2))
      return r2;
    var e2, u2 = r2[Q], c2 = o(r2);
    if (u2) {
      if (!u2.P && (u2.i < 4 || !b("ES5").K(u2)))
        return u2.t;
      u2.I = true, e2 = D(r2, c2), u2.I = false;
    } else
      e2 = D(r2, c2);
    return i(e2, function(r3, t2) {
      u2 && a(u2.t, r3) === t2 || f(e2, r3, n2(t2));
    }), 3 === c2 ? new Set(e2) : e2;
  }(e);
}
function D(n2, r2) {
  switch (r2) {
    case 2:
      return new Map(n2);
    case 3:
      return Array.from(n2);
  }
  return l(n2);
}
var G;
var U;
var W = "undefined" != typeof Symbol && "symbol" == typeof Symbol("x");
var X2 = "undefined" != typeof Map;
var q = "undefined" != typeof Set;
var B = "undefined" != typeof Proxy && void 0 !== Proxy.revocable && "undefined" != typeof Reflect;
var H = W ? Symbol.for("immer-nothing") : ((G = {})["immer-nothing"] = true, G);
var L = W ? Symbol.for("immer-draftable") : "__$immer_draftable";
var Q = W ? Symbol.for("immer-state") : "__$immer_state";
var Y = { 0: "Illegal state", 1: "Immer drafts cannot have computed properties", 2: "This object has been frozen and should not be mutated", 3: function(n2) {
  return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + n2;
}, 4: "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.", 5: "Immer forbids circular references", 6: "The first or second argument to `produce` must be a function", 7: "The third argument to `produce` must be a function or undefined", 8: "First argument to `createDraft` must be a plain object, an array, or an immerable object", 9: "First argument to `finishDraft` must be a draft returned by `createDraft`", 10: "The given draft is already finalized", 11: "Object.defineProperty() cannot be used on an Immer draft", 12: "Object.setPrototypeOf() cannot be used on an Immer draft", 13: "Immer only supports deleting array indices", 14: "Immer only supports setting array indices and the 'length' property", 15: function(n2) {
  return "Cannot apply patch, path doesn't resolve: " + n2;
}, 16: 'Sets cannot have "replace" patches.', 17: function(n2) {
  return "Unsupported patch operation: " + n2;
}, 18: function(n2) {
  return "The plugin for '" + n2 + "' has not been loaded into Immer. To enable the plugin, import and call `enable" + n2 + "()` when initializing your application.";
}, 20: "Cannot use proxies if Proxy, Proxy.revocable or Reflect are not available", 21: function(n2) {
  return "produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '" + n2 + "'";
}, 22: function(n2) {
  return "'current' expects a draft, got: " + n2;
}, 23: function(n2) {
  return "'original' expects a draft, got: " + n2;
}, 24: "Patching reserved attributes like __proto__, prototype and constructor is not allowed" };
var Z = "" + Object.prototype.constructor;
var nn = "undefined" != typeof Reflect && Reflect.ownKeys ? Reflect.ownKeys : void 0 !== Object.getOwnPropertySymbols ? function(n2) {
  return Object.getOwnPropertyNames(n2).concat(Object.getOwnPropertySymbols(n2));
} : Object.getOwnPropertyNames;
var rn = Object.getOwnPropertyDescriptors || function(n2) {
  var r2 = {};
  return nn(n2).forEach(function(t2) {
    r2[t2] = Object.getOwnPropertyDescriptor(n2, t2);
  }), r2;
};
var tn = {};
var en = { get: function(n2, r2) {
  if (r2 === Q)
    return n2;
  var e = p(n2);
  if (!u(e, r2))
    return function(n3, r3, t2) {
      var e2, i3 = I(r3, t2);
      return i3 ? "value" in i3 ? i3.value : null === (e2 = i3.get) || void 0 === e2 ? void 0 : e2.call(n3.k) : void 0;
    }(n2, e, r2);
  var i2 = e[r2];
  return n2.I || !t(i2) ? i2 : i2 === z2(n2.t, r2) ? (E(n2), n2.o[r2] = N(n2.A.h, i2, n2)) : i2;
}, has: function(n2, r2) {
  return r2 in p(n2);
}, ownKeys: function(n2) {
  return Reflect.ownKeys(p(n2));
}, set: function(n2, r2, t2) {
  var e = I(p(n2), r2);
  if (null == e ? void 0 : e.set)
    return e.set.call(n2.k, t2), true;
  if (!n2.P) {
    var i2 = z2(p(n2), r2), o2 = null == i2 ? void 0 : i2[Q];
    if (o2 && o2.t === t2)
      return n2.o[r2] = t2, n2.R[r2] = false, true;
    if (c(t2, i2) && (void 0 !== t2 || u(n2.t, r2)))
      return true;
    E(n2), k(n2);
  }
  return n2.o[r2] === t2 && (void 0 !== t2 || r2 in n2.o) || Number.isNaN(t2) && Number.isNaN(n2.o[r2]) || (n2.o[r2] = t2, n2.R[r2] = true), true;
}, deleteProperty: function(n2, r2) {
  return void 0 !== z2(n2.t, r2) || r2 in n2.t ? (n2.R[r2] = false, E(n2), k(n2)) : delete n2.R[r2], n2.o && delete n2.o[r2], true;
}, getOwnPropertyDescriptor: function(n2, r2) {
  var t2 = p(n2), e = Reflect.getOwnPropertyDescriptor(t2, r2);
  return e ? { writable: true, configurable: 1 !== n2.i || "length" !== r2, enumerable: e.enumerable, value: t2[r2] } : e;
}, defineProperty: function() {
  n(11);
}, getPrototypeOf: function(n2) {
  return Object.getPrototypeOf(n2.t);
}, setPrototypeOf: function() {
  n(12);
} };
var on = {};
i(en, function(n2, r2) {
  on[n2] = function() {
    return arguments[0] = arguments[0][0], r2.apply(this, arguments);
  };
}), on.deleteProperty = function(r2, t2) {
  return isNaN(parseInt(t2)) && n(13), on.set.call(this, r2, t2, void 0);
}, on.set = function(r2, t2, e) {
  return "length" !== t2 && isNaN(parseInt(t2)) && n(14), en.set.call(this, r2[0], t2, e, r2[0]);
};
var un = function() {
  function e(r2) {
    var e2 = this;
    this.O = B, this.D = true, this.produce = function(r3, i3, o2) {
      if ("function" == typeof r3 && "function" != typeof i3) {
        var u2 = i3;
        i3 = r3;
        var a2 = e2;
        return function(n2) {
          var r4 = this;
          void 0 === n2 && (n2 = u2);
          for (var t2 = arguments.length, e3 = Array(t2 > 1 ? t2 - 1 : 0), o3 = 1; o3 < t2; o3++)
            e3[o3 - 1] = arguments[o3];
          return a2.produce(n2, function(n3) {
            var t3;
            return (t3 = i3).call.apply(t3, [r4, n3].concat(e3));
          });
        };
      }
      var f2;
      if ("function" != typeof i3 && n(6), void 0 !== o2 && "function" != typeof o2 && n(7), t(r3)) {
        var c2 = w(e2), s2 = N(e2, r3, void 0), v2 = true;
        try {
          f2 = i3(s2), v2 = false;
        } finally {
          v2 ? g(c2) : O(c2);
        }
        return "undefined" != typeof Promise && f2 instanceof Promise ? f2.then(function(n2) {
          return j(c2, o2), P(n2, c2);
        }, function(n2) {
          throw g(c2), n2;
        }) : (j(c2, o2), P(f2, c2));
      }
      if (!r3 || "object" != typeof r3) {
        if (void 0 === (f2 = i3(r3)) && (f2 = r3), f2 === H && (f2 = void 0), e2.D && d(f2, true), o2) {
          var p2 = [], l2 = [];
          b("Patches").M(r3, f2, p2, l2), o2(p2, l2);
        }
        return f2;
      }
      n(21, r3);
    }, this.produceWithPatches = function(n2, r3) {
      if ("function" == typeof n2)
        return function(r4) {
          for (var t3 = arguments.length, i4 = Array(t3 > 1 ? t3 - 1 : 0), o3 = 1; o3 < t3; o3++)
            i4[o3 - 1] = arguments[o3];
          return e2.produceWithPatches(r4, function(r5) {
            return n2.apply(void 0, [r5].concat(i4));
          });
        };
      var t2, i3, o2 = e2.produce(n2, r3, function(n3, r4) {
        t2 = n3, i3 = r4;
      });
      return "undefined" != typeof Promise && o2 instanceof Promise ? o2.then(function(n3) {
        return [n3, t2, i3];
      }) : [o2, t2, i3];
    }, "boolean" == typeof (null == r2 ? void 0 : r2.useProxies) && this.setUseProxies(r2.useProxies), "boolean" == typeof (null == r2 ? void 0 : r2.autoFreeze) && this.setAutoFreeze(r2.autoFreeze);
  }
  var i2 = e.prototype;
  return i2.createDraft = function(e2) {
    t(e2) || n(8), r(e2) && (e2 = R(e2));
    var i3 = w(this), o2 = N(this, e2, void 0);
    return o2[Q].C = true, O(i3), o2;
  }, i2.finishDraft = function(r2, t2) {
    var e2 = r2 && r2[Q];
    e2 && e2.C || n(9), e2.I && n(10);
    var i3 = e2.A;
    return j(i3, t2), P(void 0, i3);
  }, i2.setAutoFreeze = function(n2) {
    this.D = n2;
  }, i2.setUseProxies = function(r2) {
    r2 && !B && n(20), this.O = r2;
  }, i2.applyPatches = function(n2, t2) {
    var e2;
    for (e2 = t2.length - 1; e2 >= 0; e2--) {
      var i3 = t2[e2];
      if (0 === i3.path.length && "replace" === i3.op) {
        n2 = i3.value;
        break;
      }
    }
    e2 > -1 && (t2 = t2.slice(e2 + 1));
    var o2 = b("Patches").$;
    return r(n2) ? o2(n2, t2) : this.produce(n2, function(n3) {
      return o2(n3, t2);
    });
  }, e;
}();
var an = new un();
var fn = an.produce;
var cn2 = an.produceWithPatches.bind(an);
var sn = an.setAutoFreeze.bind(an);
var vn = an.setUseProxies.bind(an);
var pn = an.applyPatches.bind(an);
var ln = an.createDraft.bind(an);
var dn = an.finishDraft.bind(an);

// node_modules/zustand/esm/middleware/immer.mjs
var immerImpl = (initializer) => (set, get2, store) => {
  store.setState = (updater, replace3, ...a2) => {
    const nextState = typeof updater === "function" ? fn(updater) : updater;
    return set(nextState, replace3, ...a2);
  };
  return initializer(store.setState, get2, store);
};
var immer = immerImpl;

// node_modules/remix-validated-form/dist/index.esm.js
var import_react6 = __toESM(require_react());
var import_react8 = __toESM(require_react());
var import_react9 = __toESM(require_react());
var import_react10 = __toESM(require_react());
var import_react11 = __toESM(require_react());
var import_jsx_runtime = __toESM(require_jsx_runtime());
var import_react12 = __toESM(require_react());
var import_react13 = __toESM(require_react());

// node_modules/remix-validated-form/node_modules/nanoid/index.browser.js
var nanoid = (size = 21) => crypto.getRandomValues(new Uint8Array(size)).reduce((id, byte) => {
  byte &= 63;
  if (byte < 36) {
    id += byte.toString(36);
  } else if (byte < 62) {
    id += (byte - 26).toString(36).toUpperCase();
  } else if (byte > 62) {
    id += "-";
  } else {
    id += "_";
  }
  return id;
}, "");

// node_modules/remix-validated-form/dist/index.esm.js
var import_react14 = __toESM(require_react());
var import_react15 = __toESM(require_react());
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var getCheckboxChecked = (checkboxValue = "on", newValue) => {
  if (Array.isArray(newValue))
    return newValue.some((val) => val === true || val === checkboxValue);
  if (typeof newValue === "boolean")
    return newValue;
  if (typeof newValue === "string")
    return newValue === checkboxValue;
  return void 0;
};
var getRadioChecked = (radioValue = "on", newValue) => {
  if (typeof newValue === "string")
    return newValue === radioValue;
  return void 0;
};
if (void 0) {
  const { it, expect } = void 0;
  it("getRadioChecked", () => {
    expect(getRadioChecked("on", "on")).toBe(true);
    expect(getRadioChecked("on", void 0)).toBe(void 0);
    expect(getRadioChecked("trueValue", void 0)).toBe(void 0);
    expect(getRadioChecked("trueValue", "bob")).toBe(false);
    expect(getRadioChecked("trueValue", "trueValue")).toBe(true);
  });
}
var defaultValidationBehavior = {
  initial: "onBlur",
  whenTouched: "onChange",
  whenSubmitted: "onChange"
};
var createGetInputProps = ({
  clearError,
  validate,
  defaultValue,
  touched,
  setTouched,
  hasBeenSubmitted,
  validationBehavior,
  name
}) => {
  const validationBehaviors = {
    ...defaultValidationBehavior,
    ...validationBehavior
  };
  return (props = {}) => {
    const behavior = hasBeenSubmitted ? validationBehaviors.whenSubmitted : touched ? validationBehaviors.whenTouched : validationBehaviors.initial;
    const inputProps = {
      ...props,
      onChange: (...args) => {
        var _a;
        if (behavior === "onChange")
          validate();
        else
          clearError();
        return (_a = props == null ? void 0 : props.onChange) == null ? void 0 : _a.call(props, ...args);
      },
      onBlur: (...args) => {
        var _a;
        if (behavior === "onBlur")
          validate();
        setTouched(true);
        return (_a = props == null ? void 0 : props.onBlur) == null ? void 0 : _a.call(props, ...args);
      },
      name
    };
    if (props.type === "checkbox") {
      inputProps.defaultChecked = getCheckboxChecked(props.value, defaultValue);
    } else if (props.type === "radio") {
      inputProps.defaultChecked = getRadioChecked(props.value, defaultValue);
    } else if (props.value === void 0) {
      inputProps.defaultValue = defaultValue;
    }
    return omitBy(inputProps, (value) => value === void 0);
  };
};
var stringToPathArray = (path) => {
  if (path.length === 0)
    return [];
  const match = path.match(/^\[(.+?)\](.*)$/) || path.match(/^\.?([^\.\[\]]+)(.*)$/);
  if (match) {
    const [_2, key, rest] = match;
    return [/^\d+$/.test(key) ? Number(key) : key, ...stringToPathArray(rest)];
  }
  return [path];
};
function setPath(object, path, defaultValue) {
  return _setPathNormalized(object, stringToPathArray(path), defaultValue);
}
function _setPathNormalized(object, path, value) {
  var _a;
  const leadingSegments = path.slice(0, -1);
  const lastSegment = path[path.length - 1];
  let obj = object;
  for (let i2 = 0; i2 < leadingSegments.length; i2++) {
    const segment = leadingSegments[i2];
    if (obj[segment] === void 0) {
      const nextSegment = (_a = leadingSegments[i2 + 1]) != null ? _a : lastSegment;
      obj[segment] = typeof nextSegment === "number" ? [] : {};
    }
    obj = obj[segment];
  }
  obj[lastSegment] = value;
  return object;
}
var getPath = (object, path) => {
  return (0, import_lodash.default)(object, path);
};
var FORM_ID_FIELD = "__rvfInternalFormId";
var FORM_DEFAULTS_FIELD = "__rvfInternalFormDefaults";
var formDefaultValuesKey = (formId) => `${FORM_DEFAULTS_FIELD}_${formId}`;
var InternalFormContext = (0, import_react5.createContext)(null);
var serverData = (data) => ({
  hydrateTo: () => data,
  map: (fn2) => serverData(fn2(data))
});
var hydratedData = () => ({
  hydrateTo: (hydratedData2) => hydratedData2,
  map: () => hydratedData()
});
var from = (data, hydrated) => hydrated ? hydratedData() : serverData(data);
var hydratable = {
  serverData,
  hydratedData,
  from
};
var requestSubmit = (element, submitter) => {
  if (typeof Object.getPrototypeOf(element).requestSubmit === "function" && true) {
    element.requestSubmit(submitter);
    return;
  }
  if (submitter) {
    validateSubmitter(element, submitter);
    submitter.click();
    return;
  }
  const dummySubmitter = document.createElement("input");
  dummySubmitter.type = "submit";
  dummySubmitter.hidden = true;
  element.appendChild(dummySubmitter);
  dummySubmitter.click();
  element.removeChild(dummySubmitter);
};
function validateSubmitter(element, submitter) {
  const isHtmlElement = submitter instanceof HTMLElement;
  if (!isHtmlElement) {
    raise(TypeError, "parameter 1 is not of type 'HTMLElement'");
  }
  const hasSubmitType = "type" in submitter && submitter.type === "submit";
  if (!hasSubmitType)
    raise(TypeError, "The specified element is not a submit button");
  const isForCorrectForm = "form" in submitter && submitter.form === element;
  if (!isForCorrectForm)
    raise(
      DOMException,
      "The specified element is not owned by this form element",
      "NotFoundError"
    );
}
function raise(errorConstructor, message, name) {
  throw new errorConstructor(
    "Failed to execute 'requestSubmit' on 'HTMLFormElement': " + message + ".",
    name
  );
}
if (void 0) {
  const { it, expect } = void 0;
  it("should validate the submitter", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    const submitter = document.createElement("input");
    expect(() => validateSubmitter(null, null)).toThrow();
    expect(() => validateSubmitter(form, null)).toThrow();
    expect(() => validateSubmitter(form, submitter)).toThrow();
    expect(
      () => validateSubmitter(form, document.createElement("div"))
    ).toThrow();
    submitter.type = "submit";
    expect(() => validateSubmitter(form, submitter)).toThrow();
    form.appendChild(submitter);
    expect(() => validateSubmitter(form, submitter)).not.toThrow();
    form.removeChild(submitter);
    expect(() => validateSubmitter(form, submitter)).toThrow();
    document.body.appendChild(submitter);
    form.id = "test-form";
    submitter.setAttribute("form", "test-form");
    expect(() => validateSubmitter(form, submitter)).not.toThrow();
    const button = document.createElement("button");
    button.type = "submit";
    form.appendChild(button);
    expect(() => validateSubmitter(form, button)).not.toThrow();
  });
}
var getArray = (values, field) => {
  const value = getPath(values, field);
  if (value === void 0 || value === null) {
    const newValue = [];
    setPath(values, field, newValue);
    return newValue;
  }
  invariant(
    Array.isArray(value),
    `FieldArray: defaultValue value for ${field} must be an array, null, or undefined`
  );
  return value;
};
var swap = (array, indexA, indexB) => {
  const itemA = array[indexA];
  const itemB = array[indexB];
  const hasItemA = indexA in array;
  const hasItemB = indexB in array;
  if (hasItemA) {
    array[indexB] = itemA;
  } else {
    delete array[indexB];
  }
  if (hasItemB) {
    array[indexA] = itemB;
  } else {
    delete array[indexA];
  }
};
function sparseSplice(array, start, deleteCount, item) {
  if (array.length < start && item) {
    array.length = start;
  }
  if (arguments.length === 4)
    return array.splice(start, deleteCount, item);
  else if (arguments.length === 3)
    return array.splice(start, deleteCount);
  return array.splice(start);
}
var move = (array, from2, to) => {
  const [item] = sparseSplice(array, from2, 1);
  sparseSplice(array, to, 0, item);
};
var insert = (array, index, value) => {
  sparseSplice(array, index, 0, value);
};
var insertEmpty = (array, index) => {
  const tail = sparseSplice(array, index);
  tail.forEach((item, i2) => {
    sparseSplice(array, index + i2 + 1, 0, item);
  });
};
var remove = (array, index) => {
  sparseSplice(array, index, 1);
};
var replace = (array, index, value) => {
  sparseSplice(array, index, 1, value);
};
var mutateAsArray = (field, obj, mutate) => {
  const beforeKeys = /* @__PURE__ */ new Set();
  const arr = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith(field) && key !== field) {
      beforeKeys.add(key);
      setPath(arr, key.substring(field.length), value);
    }
  }
  mutate(arr);
  for (const key of beforeKeys) {
    delete obj[key];
  }
  const newKeys = getDeepArrayPaths(arr);
  for (const key of newKeys) {
    const val = getPath(arr, key);
    if (val !== void 0) {
      obj[`${field}${key}`] = val;
    }
  }
};
var getDeepArrayPaths = (obj, basePath = "") => {
  if (Array.isArray(obj)) {
    return obj.flatMap(
      (item, index) => getDeepArrayPaths(item, `${basePath}[${index}]`)
    );
  }
  if (typeof obj === "object") {
    return Object.keys(obj).flatMap(
      (key) => getDeepArrayPaths(obj[key], `${basePath}.${key}`)
    );
  }
  return [basePath];
};
if (void 0) {
  const { describe, expect, it } = void 0;
  const countArrayItems = (arr) => {
    let count = 0;
    arr.forEach(() => count++);
    return count;
  };
  describe("getArray", () => {
    it("shoud get a deeply nested array that can be mutated to update the nested value", () => {
      const values = {
        d: [
          { foo: "bar", baz: [true, false] },
          { e: true, f: "hi" }
        ]
      };
      const result = getArray(values, "d[0].baz");
      const finalValues = {
        d: [
          { foo: "bar", baz: [true, false, true] },
          { e: true, f: "hi" }
        ]
      };
      expect(result).toEqual([true, false]);
      result.push(true);
      expect(values).toEqual(finalValues);
    });
    it("should return an empty array that can be mutated if result is null or undefined", () => {
      const values = {};
      const result = getArray(values, "a.foo[0].bar");
      const finalValues = {
        a: { foo: [{ bar: ["Bob ross"] }] }
      };
      expect(result).toEqual([]);
      result.push("Bob ross");
      expect(values).toEqual(finalValues);
    });
    it("should throw if the value is defined and not an array", () => {
      const values = { foo: "foo" };
      expect(() => getArray(values, "foo")).toThrow();
    });
  });
  describe("swap", () => {
    it("should swap two items", () => {
      const array = [1, 2, 3];
      swap(array, 0, 1);
      expect(array).toEqual([2, 1, 3]);
    });
    it("should work for sparse arrays", () => {
      const arr = [];
      arr[0] = true;
      swap(arr, 0, 2);
      expect(countArrayItems(arr)).toEqual(1);
      expect(0 in arr).toBe(false);
      expect(2 in arr).toBe(true);
      expect(arr[2]).toEqual(true);
    });
  });
  describe("move", () => {
    it("should move an item to a new index", () => {
      const array = [1, 2, 3];
      move(array, 0, 1);
      expect(array).toEqual([2, 1, 3]);
    });
    it("should work with sparse arrays", () => {
      const array = [1];
      move(array, 0, 2);
      expect(countArrayItems(array)).toEqual(1);
      expect(array).toEqual([void 0, void 0, 1]);
    });
  });
  describe("insert", () => {
    it("should insert an item at a new index", () => {
      const array = [1, 2, 3];
      insert(array, 1, 4);
      expect(array).toEqual([1, 4, 2, 3]);
    });
    it("should be able to insert falsey values", () => {
      const array = [1, 2, 3];
      insert(array, 1, null);
      expect(array).toEqual([1, null, 2, 3]);
    });
    it("should handle sparse arrays", () => {
      const array = [];
      array[2] = true;
      insert(array, 0, true);
      expect(countArrayItems(array)).toEqual(2);
      expect(array).toEqual([true, void 0, void 0, true]);
    });
  });
  describe("insertEmpty", () => {
    it("should insert an empty item at a given index", () => {
      const array = [1, 2, 3];
      insertEmpty(array, 1);
      expect(array).toStrictEqual([1, , 2, 3]);
      expect(array).not.toStrictEqual([1, void 0, 2, 3]);
    });
    it("should work with already sparse arrays", () => {
      const array = [, , 1, , 2, , 3];
      insertEmpty(array, 3);
      expect(array).toStrictEqual([, , 1, , , 2, , 3]);
      expect(array).not.toStrictEqual([
        void 0,
        void 0,
        1,
        void 0,
        void 0,
        2,
        void 0,
        3
      ]);
    });
  });
  describe("remove", () => {
    it("should remove an item at a given index", () => {
      const array = [1, 2, 3];
      remove(array, 1);
      expect(array).toEqual([1, 3]);
    });
    it("should handle sparse arrays", () => {
      const array = [];
      array[2] = true;
      remove(array, 0);
      expect(countArrayItems(array)).toEqual(1);
      expect(array).toEqual([void 0, true]);
    });
  });
  describe("replace", () => {
    it("should replace an item at a given index", () => {
      const array = [1, 2, 3];
      replace(array, 1, 4);
      expect(array).toEqual([1, 4, 3]);
    });
    it("should handle sparse arrays", () => {
      const array = [];
      array[2] = true;
      replace(array, 0, true);
      expect(countArrayItems(array)).toEqual(2);
      expect(array).toEqual([true, void 0, true]);
    });
  });
  describe("mutateAsArray", () => {
    it("should handle swap", () => {
      const values = {
        myField: "something",
        "myField[0]": "foo",
        "myField[2]": "bar",
        otherField: "baz",
        "otherField[0]": "something else"
      };
      mutateAsArray("myField", values, (arr) => {
        swap(arr, 0, 2);
      });
      expect(values).toEqual({
        myField: "something",
        "myField[0]": "bar",
        "myField[2]": "foo",
        otherField: "baz",
        "otherField[0]": "something else"
      });
    });
    it("should swap sparse arrays", () => {
      const values = {
        myField: "something",
        "myField[0]": "foo",
        otherField: "baz",
        "otherField[0]": "something else"
      };
      mutateAsArray("myField", values, (arr) => {
        swap(arr, 0, 2);
      });
      expect(values).toEqual({
        myField: "something",
        "myField[2]": "foo",
        otherField: "baz",
        "otherField[0]": "something else"
      });
    });
    it("should handle arrays with nested values", () => {
      const values = {
        myField: "something",
        "myField[0].title": "foo",
        "myField[0].note": "bar",
        "myField[2].title": "other",
        "myField[2].note": "other",
        otherField: "baz",
        "otherField[0]": "something else"
      };
      mutateAsArray("myField", values, (arr) => {
        swap(arr, 0, 2);
      });
      expect(values).toEqual({
        myField: "something",
        "myField[0].title": "other",
        "myField[0].note": "other",
        "myField[2].title": "foo",
        "myField[2].note": "bar",
        otherField: "baz",
        "otherField[0]": "something else"
      });
    });
    it("should handle move", () => {
      const values = {
        myField: "something",
        "myField[0]": "foo",
        "myField[1]": "bar",
        "myField[2]": "baz",
        "otherField[0]": "something else"
      };
      mutateAsArray("myField", values, (arr) => {
        move(arr, 0, 2);
      });
      expect(values).toEqual({
        myField: "something",
        "myField[0]": "bar",
        "myField[1]": "baz",
        "myField[2]": "foo",
        "otherField[0]": "something else"
      });
    });
    it("should not create keys for `undefined`", () => {
      const values = {
        "myField[0]": "foo"
      };
      mutateAsArray("myField", values, (arr) => {
        arr.unshift(void 0);
      });
      expect(Object.keys(values)).toHaveLength(1);
      expect(values).toEqual({
        "myField[1]": "foo"
      });
    });
    it("should handle remove", () => {
      const values = {
        myField: "something",
        "myField[0]": "foo",
        "myField[1]": "bar",
        "myField[2]": "baz",
        "otherField[0]": "something else"
      };
      mutateAsArray("myField", values, (arr) => {
        remove(arr, 1);
      });
      expect(values).toEqual({
        myField: "something",
        "myField[0]": "foo",
        "myField[1]": "baz",
        "otherField[0]": "something else"
      });
      expect("myField[2]" in values).toBe(false);
    });
  });
  describe("getDeepArrayPaths", () => {
    it("should return all paths recursively", () => {
      const obj = [
        true,
        true,
        [true, true],
        { foo: true, bar: { baz: true, test: [true] } }
      ];
      expect(getDeepArrayPaths(obj, "myField")).toEqual([
        "myField[0]",
        "myField[1]",
        "myField[2][0]",
        "myField[2][1]",
        "myField[3].foo",
        "myField[3].bar.baz",
        "myField[3].bar.test[0]"
      ]);
    });
  });
}
var noOp = () => {
};
var defaultFormState = {
  isHydrated: false,
  isSubmitting: false,
  hasBeenSubmitted: false,
  touchedFields: {},
  fieldErrors: {},
  formElement: null,
  isValid: () => true,
  startSubmit: noOp,
  endSubmit: noOp,
  setTouched: noOp,
  setFieldError: noOp,
  setFieldErrors: noOp,
  clearFieldError: noOp,
  currentDefaultValues: {},
  reset: () => noOp,
  syncFormProps: noOp,
  setFormElement: noOp,
  validate: async () => {
    throw new Error("Validate called before form was initialized.");
  },
  smartValidate: async () => {
    throw new Error("Validate called before form was initialized.");
  },
  submit: async () => {
    throw new Error("Submit called before form was initialized.");
  },
  resetFormElement: noOp,
  getValues: () => new FormData(),
  controlledFields: {
    values: {},
    refCounts: {},
    valueUpdatePromises: {},
    valueUpdateResolvers: {},
    register: noOp,
    unregister: noOp,
    setValue: noOp,
    getValue: noOp,
    kickoffValueUpdate: noOp,
    awaitValueUpdate: async () => {
      throw new Error("AwaitValueUpdate called before form was initialized.");
    },
    array: {
      push: noOp,
      swap: noOp,
      move: noOp,
      insert: noOp,
      unshift: noOp,
      remove: noOp,
      pop: noOp,
      replace: noOp
    }
  }
};
var createFormState = (set, get2) => ({
  isHydrated: false,
  isSubmitting: false,
  hasBeenSubmitted: false,
  touchedFields: {},
  fieldErrors: {},
  formElement: null,
  currentDefaultValues: {},
  isValid: () => Object.keys(get2().fieldErrors).length === 0,
  startSubmit: () => set((state) => {
    state.isSubmitting = true;
    state.hasBeenSubmitted = true;
  }),
  endSubmit: () => set((state) => {
    state.isSubmitting = false;
  }),
  setTouched: (fieldName, touched) => set((state) => {
    state.touchedFields[fieldName] = touched;
  }),
  setFieldError: (fieldName, error) => set((state) => {
    state.fieldErrors[fieldName] = error;
  }),
  setFieldErrors: (errors) => set((state) => {
    state.fieldErrors = errors;
  }),
  clearFieldError: (fieldName) => set((state) => {
    delete state.fieldErrors[fieldName];
  }),
  reset: () => set((state) => {
    var _a, _b;
    state.fieldErrors = {};
    state.touchedFields = {};
    state.hasBeenSubmitted = false;
    const nextDefaults = (_b = (_a = state.formProps) == null ? void 0 : _a.defaultValues) != null ? _b : {};
    state.controlledFields.values = nextDefaults;
    state.currentDefaultValues = nextDefaults;
  }),
  syncFormProps: (props) => set((state) => {
    if (!state.isHydrated) {
      state.controlledFields.values = props.defaultValues;
      state.currentDefaultValues = props.defaultValues;
    }
    state.formProps = props;
    state.isHydrated = true;
  }),
  setFormElement: (formElement) => {
    if (get2().formElement === formElement)
      return;
    set((state) => {
      state.formElement = formElement;
    });
  },
  validate: async () => {
    var _a;
    const formElement = get2().formElement;
    invariant(
      formElement,
      "Cannot find reference to form. This is probably a bug in remix-validated-form."
    );
    const validator2 = (_a = get2().formProps) == null ? void 0 : _a.validator;
    invariant(
      validator2,
      "Cannot find validator. This is probably a bug in remix-validated-form."
    );
    const result = await validator2.validate(new FormData(formElement));
    if (result.error)
      get2().setFieldErrors(result.error.fieldErrors);
    return result;
  },
  smartValidate: async ({ alwaysIncludeErrorsFromFields = [] } = {}) => {
    var _a;
    const formElement = get2().formElement;
    invariant(
      formElement,
      "Cannot find reference to form. This is probably a bug in remix-validated-form."
    );
    const validator2 = (_a = get2().formProps) == null ? void 0 : _a.validator;
    invariant(
      validator2,
      "Cannot find validator. This is probably a bug in remix-validated-form."
    );
    await Promise.all(
      alwaysIncludeErrorsFromFields.map(
        (field) => {
          var _a2, _b;
          return (_b = (_a2 = get2().controlledFields).awaitValueUpdate) == null ? void 0 : _b.call(_a2, field);
        }
      )
    );
    const validationResult = await validator2.validate(
      new FormData(formElement)
    );
    if (!validationResult.error) {
      const hadErrors = Object.keys(get2().fieldErrors).length > 0;
      if (hadErrors)
        get2().setFieldErrors({});
      return validationResult;
    }
    const {
      error: { fieldErrors }
    } = validationResult;
    const errorFields = /* @__PURE__ */ new Set();
    const incomingErrors = /* @__PURE__ */ new Set();
    const prevErrors = /* @__PURE__ */ new Set();
    Object.keys(fieldErrors).forEach((field) => {
      errorFields.add(field);
      incomingErrors.add(field);
    });
    Object.keys(get2().fieldErrors).forEach((field) => {
      errorFields.add(field);
      prevErrors.add(field);
    });
    const fieldsToUpdate = /* @__PURE__ */ new Set();
    const fieldsToDelete = /* @__PURE__ */ new Set();
    errorFields.forEach((field) => {
      if (!incomingErrors.has(field)) {
        fieldsToDelete.add(field);
        return;
      }
      if (prevErrors.has(field) && incomingErrors.has(field)) {
        if (fieldErrors[field] !== get2().fieldErrors[field])
          fieldsToUpdate.add(field);
        return;
      }
      if (alwaysIncludeErrorsFromFields.includes(field)) {
        fieldsToUpdate.add(field);
        return;
      }
      if (!prevErrors.has(field)) {
        const fieldTouched = get2().touchedFields[field];
        const formHasBeenSubmitted = get2().hasBeenSubmitted;
        if (fieldTouched || formHasBeenSubmitted)
          fieldsToUpdate.add(field);
        return;
      }
    });
    if (fieldsToDelete.size === 0 && fieldsToUpdate.size === 0) {
      return { ...validationResult, error: { fieldErrors: get2().fieldErrors } };
    }
    set((state) => {
      fieldsToDelete.forEach((field) => {
        delete state.fieldErrors[field];
      });
      fieldsToUpdate.forEach((field) => {
        state.fieldErrors[field] = fieldErrors[field];
      });
    });
    return { ...validationResult, error: { fieldErrors: get2().fieldErrors } };
  },
  submit: () => {
    const formElement = get2().formElement;
    invariant(
      formElement,
      "Cannot find reference to form. This is probably a bug in remix-validated-form."
    );
    requestSubmit(formElement);
  },
  getValues: () => {
    var _a;
    return new FormData((_a = get2().formElement) != null ? _a : void 0);
  },
  resetFormElement: () => {
    var _a;
    return (_a = get2().formElement) == null ? void 0 : _a.reset();
  },
  controlledFields: {
    values: {},
    refCounts: {},
    valueUpdatePromises: {},
    valueUpdateResolvers: {},
    register: (fieldName) => {
      set((state) => {
        var _a;
        const current = (_a = state.controlledFields.refCounts[fieldName]) != null ? _a : 0;
        state.controlledFields.refCounts[fieldName] = current + 1;
      });
    },
    unregister: (fieldName) => {
      if (get2() === null || get2() === void 0)
        return;
      set((state) => {
        var _a, _b, _c13;
        const current = (_a = state.controlledFields.refCounts[fieldName]) != null ? _a : 0;
        if (current > 1) {
          state.controlledFields.refCounts[fieldName] = current - 1;
          return;
        }
        const isNested = Object.keys(state.controlledFields.refCounts).some(
          (key) => fieldName.startsWith(key) && key !== fieldName
        );
        if (!isNested) {
          setPath(
            state.controlledFields.values,
            fieldName,
            getPath((_b = state.formProps) == null ? void 0 : _b.defaultValues, fieldName)
          );
          setPath(
            state.currentDefaultValues,
            fieldName,
            getPath((_c13 = state.formProps) == null ? void 0 : _c13.defaultValues, fieldName)
          );
        }
        delete state.controlledFields.refCounts[fieldName];
      });
    },
    getValue: (fieldName) => getPath(get2().controlledFields.values, fieldName),
    setValue: (fieldName, value) => {
      set((state) => {
        setPath(state.controlledFields.values, fieldName, value);
      });
      get2().controlledFields.kickoffValueUpdate(fieldName);
    },
    kickoffValueUpdate: (fieldName) => {
      const clear = () => set((state) => {
        delete state.controlledFields.valueUpdateResolvers[fieldName];
        delete state.controlledFields.valueUpdatePromises[fieldName];
      });
      set((state) => {
        const promise = new Promise((resolve) => {
          state.controlledFields.valueUpdateResolvers[fieldName] = resolve;
        }).then(clear);
        state.controlledFields.valueUpdatePromises[fieldName] = promise;
      });
    },
    awaitValueUpdate: async (fieldName) => {
      await get2().controlledFields.valueUpdatePromises[fieldName];
    },
    array: {
      push: (fieldName, item) => {
        set((state) => {
          getArray(state.controlledFields.values, fieldName).push(item);
          getArray(state.currentDefaultValues, fieldName).push(item);
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      swap: (fieldName, indexA, indexB) => {
        set((state) => {
          swap(
            getArray(state.controlledFields.values, fieldName),
            indexA,
            indexB
          );
          swap(
            getArray(state.currentDefaultValues, fieldName),
            indexA,
            indexB
          );
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => swap(array, indexA, indexB)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => swap(array, indexA, indexB)
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      move: (fieldName, from2, to) => {
        set((state) => {
          move(
            getArray(state.controlledFields.values, fieldName),
            from2,
            to
          );
          move(
            getArray(state.currentDefaultValues, fieldName),
            from2,
            to
          );
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => move(array, from2, to)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => move(array, from2, to)
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      insert: (fieldName, index, item) => {
        set((state) => {
          insert(
            getArray(state.controlledFields.values, fieldName),
            index,
            item
          );
          insert(
            getArray(state.currentDefaultValues, fieldName),
            index,
            item
          );
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => insertEmpty(array, index)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => insertEmpty(array, index)
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      remove: (fieldName, index) => {
        set((state) => {
          remove(
            getArray(state.controlledFields.values, fieldName),
            index
          );
          remove(
            getArray(state.currentDefaultValues, fieldName),
            index
          );
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => remove(array, index)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => remove(array, index)
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      pop: (fieldName) => {
        set((state) => {
          getArray(state.controlledFields.values, fieldName).pop();
          getArray(state.currentDefaultValues, fieldName).pop();
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => array.pop()
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => array.pop()
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      },
      unshift: (fieldName, value) => {
        set((state) => {
          getArray(state.controlledFields.values, fieldName).unshift(value);
          getArray(state.currentDefaultValues, fieldName).unshift(value);
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => insertEmpty(array, 0)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => insertEmpty(array, 0)
          );
        });
      },
      replace: (fieldName, index, item) => {
        set((state) => {
          replace(
            getArray(state.controlledFields.values, fieldName),
            index,
            item
          );
          replace(
            getArray(state.currentDefaultValues, fieldName),
            index,
            item
          );
          mutateAsArray(
            fieldName,
            state.touchedFields,
            (array) => replace(array, index, item)
          );
          mutateAsArray(
            fieldName,
            state.fieldErrors,
            (array) => replace(array, index, item)
          );
        });
        get2().controlledFields.kickoffValueUpdate(fieldName);
      }
    }
  }
});
var useRootFormStore = create()(
  immer((set, get2) => ({
    forms: {},
    form: (formId) => {
      var _a;
      return (_a = get2().forms[formId]) != null ? _a : defaultFormState;
    },
    cleanupForm: (formId) => {
      set((state) => {
        delete state.forms[formId];
      });
    },
    registerForm: (formId) => {
      if (get2().forms[formId])
        return;
      set((state) => {
        state.forms[formId] = createFormState(
          (setter) => set((state2) => setter(state2.forms[formId])),
          () => get2().forms[formId]
        );
      });
    }
  }))
);
var useFormStore = (formId, selector) => {
  return useRootFormStore((state) => selector(state.form(formId)));
};
var useInternalFormContext = (formId, hookName) => {
  const formContext = (0, import_react4.useContext)(InternalFormContext);
  if (formId)
    return { formId };
  if (formContext)
    return formContext;
  throw new Error(
    `Unable to determine form for ${hookName}. Please use it inside a ValidatedForm or pass a 'formId'.`
  );
};
function useErrorResponseForForm({
  fetcher,
  subaction,
  formId
}) {
  var _a;
  const actionData = useActionData();
  if (fetcher) {
    if ((_a = fetcher.data) == null ? void 0 : _a.fieldErrors)
      return fetcher.data;
    return null;
  }
  if (!(actionData == null ? void 0 : actionData.fieldErrors))
    return null;
  if (typeof formId === "string" && actionData.formId)
    return actionData.formId === formId ? actionData : null;
  if (!subaction && !actionData.subaction || actionData.subaction === subaction)
    return actionData;
  return null;
}
var useFieldErrorsForForm = (context) => {
  const response = useErrorResponseForForm(context);
  const hydrated = useFormStore(context.formId, (state) => state.isHydrated);
  return hydratable.from(response == null ? void 0 : response.fieldErrors, hydrated);
};
var useDefaultValuesFromLoader = ({
  formId
}) => {
  const matches = useMatches();
  if (typeof formId === "string") {
    const dataKey = formDefaultValuesKey(formId);
    const match = matches.reverse().find(
      (match2) => match2.data && typeof match2.data === "object" && dataKey in match2.data
    );
    return match == null ? void 0 : match.data[dataKey];
  }
  return null;
};
var useDefaultValuesForForm = (context) => {
  const { formId, defaultValuesProp } = context;
  const hydrated = useFormStore(formId, (state) => state.isHydrated);
  const errorResponse = useErrorResponseForForm(context);
  const defaultValuesFromLoader = useDefaultValuesFromLoader(context);
  if (hydrated)
    return hydratable.hydratedData();
  if (errorResponse == null ? void 0 : errorResponse.repopulateFields) {
    invariant(
      typeof errorResponse.repopulateFields === "object",
      "repopulateFields returned something other than an object"
    );
    return hydratable.serverData(errorResponse.repopulateFields);
  }
  if (defaultValuesProp)
    return hydratable.serverData(defaultValuesProp);
  return hydratable.serverData(defaultValuesFromLoader);
};
var useHasActiveFormSubmit = ({
  fetcher
}) => {
  let navigation = useNavigation();
  const hasActiveSubmission = fetcher ? fetcher.state === "submitting" : navigation.state === "submitting" || navigation.state === "loading";
  return hasActiveSubmission;
};
var useFieldTouched = (field, { formId }) => {
  const touched = useFormStore(formId, (state) => state.touchedFields[field]);
  const setFieldTouched = useFormStore(formId, (state) => state.setTouched);
  const setTouched = (0, import_react4.useCallback)(
    (touched2) => setFieldTouched(field, touched2),
    [field, setFieldTouched]
  );
  return [touched, setTouched];
};
var useFieldError = (name, context) => {
  const fieldErrors = useFieldErrorsForForm(context);
  const state = useFormStore(
    context.formId,
    (state2) => state2.fieldErrors[name]
  );
  return fieldErrors.map((fieldErrors2) => fieldErrors2 == null ? void 0 : fieldErrors2[name]).hydrateTo(state);
};
var useClearError = (context) => {
  const { formId } = context;
  return useFormStore(formId, (state) => state.clearFieldError);
};
var useCurrentDefaultValueForField = (formId, field) => useFormStore(formId, (state) => getPath(state.currentDefaultValues, field));
var useFieldDefaultValue = (name, context) => {
  const defaultValues = useDefaultValuesForForm(context);
  const state = useCurrentDefaultValueForField(context.formId, name);
  return defaultValues.map((val) => getPath(val, name)).hydrateTo(state);
};
var useInternalIsSubmitting = (formId) => useFormStore(formId, (state) => state.isSubmitting);
var useInternalIsValid = (formId) => useFormStore(formId, (state) => state.isValid());
var useInternalHasBeenSubmitted = (formId) => useFormStore(formId, (state) => state.hasBeenSubmitted);
var useSmartValidate = (formId) => useFormStore(formId, (state) => state.smartValidate);
var useValidate = (formId) => useFormStore(formId, (state) => state.validate);
var noOpReceiver = () => () => {
};
var useRegisterReceiveFocus = (formId) => useFormStore(
  formId,
  (state) => {
    var _a, _b;
    return (_b = (_a = state.formProps) == null ? void 0 : _a.registerReceiveFocus) != null ? _b : noOpReceiver;
  }
);
var defaultDefaultValues = {};
var useSyncedDefaultValues = (formId) => useFormStore(
  formId,
  (state) => {
    var _a, _b;
    return (_b = (_a = state.formProps) == null ? void 0 : _a.defaultValues) != null ? _b : defaultDefaultValues;
  }
);
var useSetTouched = ({ formId }) => useFormStore(formId, (state) => state.setTouched);
var useTouchedFields = (formId) => useFormStore(formId, (state) => state.touchedFields);
var useFieldErrors = (formId) => useFormStore(formId, (state) => state.fieldErrors);
var useSetFieldErrors = (formId) => useFormStore(formId, (state) => state.setFieldErrors);
var useResetFormElement = (formId) => useFormStore(formId, (state) => state.resetFormElement);
var useSubmitForm = (formId) => useFormStore(formId, (state) => state.submit);
var useFormActionProp = (formId) => useFormStore(formId, (state) => {
  var _a;
  return (_a = state.formProps) == null ? void 0 : _a.action;
});
var useFormSubactionProp = (formId) => useFormStore(formId, (state) => {
  var _a;
  return (_a = state.formProps) == null ? void 0 : _a.subaction;
});
var useFormValues = (formId) => useFormStore(formId, (state) => state.getValues);
var useControlledFieldValue = (context, field) => {
  const value = useFormStore(
    context.formId,
    (state) => state.controlledFields.getValue(field)
  );
  const isFormHydrated = useFormStore(
    context.formId,
    (state) => state.isHydrated
  );
  const defaultValue = useFieldDefaultValue(field, context);
  return isFormHydrated ? value : defaultValue;
};
var useRegisterControlledField = (context, field) => {
  const resolveUpdate = useFormStore(
    context.formId,
    (state) => state.controlledFields.valueUpdateResolvers[field]
  );
  (0, import_react6.useEffect)(() => {
    resolveUpdate == null ? void 0 : resolveUpdate();
  }, [resolveUpdate]);
  const register = useFormStore(
    context.formId,
    (state) => state.controlledFields.register
  );
  const unregister = useFormStore(
    context.formId,
    (state) => state.controlledFields.unregister
  );
  (0, import_react6.useEffect)(() => {
    register(field);
    return () => unregister(field);
  }, [context.formId, field, register, unregister]);
};
var useControllableValue = (context, field) => {
  useRegisterControlledField(context, field);
  const setControlledFieldValue = useFormStore(
    context.formId,
    (state) => state.controlledFields.setValue
  );
  const setValue = (0, import_react6.useCallback)(
    (value2) => setControlledFieldValue(field, value2),
    [field, setControlledFieldValue]
  );
  const value = useControlledFieldValue(context, field);
  return [value, setValue];
};
var useIsSubmitting = (formId) => {
  const formContext = useInternalFormContext(formId, "useIsSubmitting");
  return useInternalIsSubmitting(formContext.formId);
};
var useIsValid = (formId) => {
  const formContext = useInternalFormContext(formId, "useIsValid");
  return useInternalIsValid(formContext.formId);
};
var useField = (name, options) => {
  const { formId: providedFormId, handleReceiveFocus } = options != null ? options : {};
  const formContext = useInternalFormContext(providedFormId, "useField");
  const defaultValue = useFieldDefaultValue(name, formContext);
  const [touched, setTouched] = useFieldTouched(name, formContext);
  const error = useFieldError(name, formContext);
  const clearError = useClearError(formContext);
  const hasBeenSubmitted = useInternalHasBeenSubmitted(formContext.formId);
  const smartValidate = useSmartValidate(formContext.formId);
  const registerReceiveFocus = useRegisterReceiveFocus(formContext.formId);
  (0, import_react2.useEffect)(() => {
    if (handleReceiveFocus)
      return registerReceiveFocus(name, handleReceiveFocus);
  }, [handleReceiveFocus, name, registerReceiveFocus]);
  const field = (0, import_react2.useMemo)(() => {
    const helpers = {
      error,
      clearError: () => clearError(name),
      validate: () => smartValidate({ alwaysIncludeErrorsFromFields: [name] }),
      defaultValue,
      touched,
      setTouched
    };
    const getInputProps = createGetInputProps({
      ...helpers,
      name,
      hasBeenSubmitted,
      validationBehavior: options == null ? void 0 : options.validationBehavior
    });
    return {
      ...helpers,
      getInputProps
    };
  }, [
    error,
    clearError,
    defaultValue,
    touched,
    setTouched,
    name,
    hasBeenSubmitted,
    options == null ? void 0 : options.validationBehavior,
    smartValidate
  ]);
  return field;
};
var useControlField = (name, formId) => {
  const context = useInternalFormContext(formId, "useControlField");
  const [value, setValue] = useControllableValue(context, name);
  return [value, setValue];
};
var MultiValueMap = class {
  constructor() {
    this.dict = /* @__PURE__ */ new Map();
    this.add = (key, value) => {
      if (this.dict.has(key)) {
        this.dict.get(key).push(value);
      } else {
        this.dict.set(key, [value]);
      }
    };
    this.delete = (key) => {
      this.dict.delete(key);
    };
    this.remove = (key, value) => {
      if (!this.dict.has(key))
        return;
      const array = this.dict.get(key);
      const index = array.indexOf(value);
      if (index !== -1)
        array.splice(index, 1);
      if (array.length === 0)
        this.dict.delete(key);
    };
    this.getAll = (key) => {
      var _a;
      return (_a = this.dict.get(key)) != null ? _a : [];
    };
    this.entries = () => this.dict.entries();
    this.values = () => this.dict.values();
    this.has = (key) => this.dict.has(key);
  }
};
var useMultiValueMap = () => {
  const ref = (0, import_react9.useRef)(null);
  return (0, import_react9.useCallback)(() => {
    if (ref.current)
      return ref.current;
    ref.current = new MultiValueMap();
    return ref.current;
  }, []);
};
function useSubmitComplete(isSubmitting, callback) {
  const isPending = (0, import_react10.useRef)(false);
  (0, import_react10.useEffect)(() => {
    if (isSubmitting) {
      isPending.current = true;
    }
    if (!isSubmitting && isPending.current) {
      isPending.current = false;
      callback();
    }
  });
}
var mergeRefs = (refs) => {
  return (value) => {
    refs.filter(Boolean).forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref != null) {
        ref.current = value;
      }
    });
  };
};
var useIsomorphicLayoutEffect = typeof window !== "undefined" ? import_react11.useLayoutEffect : import_react11.useEffect;
var useDeepEqualsMemo = (item) => {
  const ref = (0, import_react11.useRef)(item);
  const areEqual = ref.current === item || equals(ref.current, item);
  (0, import_react11.useEffect)(() => {
    if (!areEqual) {
      ref.current = item;
    }
  });
  return areEqual ? ref.current : item;
};
var getDataFromForm = (el) => new FormData(el);
function nonNull(value) {
  return value !== null;
}
var focusFirstInvalidInput = (fieldErrors, customFocusHandlers, formElement) => {
  var _a;
  const namesInOrder = [...formElement.elements].map((el) => {
    const input = el instanceof RadioNodeList ? el[0] : el;
    if (input instanceof HTMLElement && "name" in input)
      return input.name;
    return null;
  }).filter(nonNull).filter((name) => name in fieldErrors);
  const uniqueNamesInOrder = uniq(namesInOrder);
  for (const fieldName of uniqueNamesInOrder) {
    if (customFocusHandlers.has(fieldName)) {
      customFocusHandlers.getAll(fieldName).forEach((handler) => {
        handler();
      });
      break;
    }
    const elem = formElement.elements.namedItem(fieldName);
    if (!elem)
      continue;
    if (elem instanceof RadioNodeList) {
      const selectedRadio = (_a = [...elem].filter(
        (item) => item instanceof HTMLInputElement
      ).find((item) => item.value === elem.value)) != null ? _a : elem[0];
      if (selectedRadio && selectedRadio instanceof HTMLInputElement) {
        selectedRadio.focus();
        break;
      }
    }
    if (elem instanceof HTMLElement) {
      if (elem instanceof HTMLInputElement && elem.type === "hidden") {
        continue;
      }
      elem.focus();
      break;
    }
  }
};
var useFormId = (providedId) => {
  const [symbolId] = (0, import_react8.useState)(() => Symbol("remix-validated-form-id"));
  return providedId != null ? providedId : symbolId;
};
var FormResetter = ({
  resetAfterSubmit,
  formRef
}) => {
  const isSubmitting = useIsSubmitting();
  const isValid = useIsValid();
  useSubmitComplete(isSubmitting, () => {
    var _a;
    if (isValid && resetAfterSubmit) {
      (_a = formRef.current) == null ? void 0 : _a.reset();
    }
  });
  return null;
};
function formEventProxy(event) {
  let defaultPrevented = false;
  return new Proxy(event, {
    get: (target, prop) => {
      if (prop === "preventDefault") {
        return () => {
          defaultPrevented = true;
        };
      }
      if (prop === "defaultPrevented") {
        return defaultPrevented;
      }
      return target[prop];
    }
  });
}
function ValidatedForm({
  validator: validator2,
  onSubmit,
  children,
  fetcher,
  action,
  defaultValues: unMemoizedDefaults,
  formRef: formRefProp,
  onReset,
  subaction,
  resetAfterSubmit = false,
  disableFocusOnError,
  method,
  replace: replace22,
  id,
  preventScrollReset,
  relative,
  encType,
  ...rest
}) {
  var _a;
  const formId = useFormId(id);
  const providedDefaultValues = useDeepEqualsMemo(unMemoizedDefaults);
  const contextValue = (0, import_react8.useMemo)(
    () => ({
      formId,
      action,
      subaction,
      defaultValuesProp: providedDefaultValues,
      fetcher
    }),
    [action, fetcher, formId, providedDefaultValues, subaction]
  );
  const backendError = useErrorResponseForForm(contextValue);
  const backendDefaultValues = useDefaultValuesFromLoader(contextValue);
  const hasActiveSubmission = useHasActiveFormSubmit(contextValue);
  const formRef = (0, import_react8.useRef)(null);
  const Form2 = (_a = fetcher == null ? void 0 : fetcher.Form) != null ? _a : Form;
  const submit = useSubmit();
  const setFieldErrors = useSetFieldErrors(formId);
  const setFieldError = useFormStore(formId, (state) => state.setFieldError);
  const reset = useFormStore(formId, (state) => state.reset);
  const startSubmit = useFormStore(formId, (state) => state.startSubmit);
  const endSubmit = useFormStore(formId, (state) => state.endSubmit);
  const syncFormProps = useFormStore(formId, (state) => state.syncFormProps);
  const setFormElementInState = useFormStore(
    formId,
    (state) => state.setFormElement
  );
  const cleanupForm = useRootFormStore((state) => state.cleanupForm);
  const registerForm = useRootFormStore((state) => state.registerForm);
  const customFocusHandlers = useMultiValueMap();
  const registerReceiveFocus = (0, import_react8.useCallback)(
    (fieldName, handler) => {
      customFocusHandlers().add(fieldName, handler);
      return () => {
        customFocusHandlers().remove(fieldName, handler);
      };
    },
    [customFocusHandlers]
  );
  useIsomorphicLayoutEffect(() => {
    registerForm(formId);
    return () => cleanupForm(formId);
  }, [cleanupForm, formId, registerForm]);
  useIsomorphicLayoutEffect(() => {
    var _a2;
    syncFormProps({
      action,
      defaultValues: (_a2 = providedDefaultValues != null ? providedDefaultValues : backendDefaultValues) != null ? _a2 : {},
      subaction,
      registerReceiveFocus,
      validator: validator2
    });
  }, [
    action,
    providedDefaultValues,
    registerReceiveFocus,
    subaction,
    syncFormProps,
    backendDefaultValues,
    validator2
  ]);
  useIsomorphicLayoutEffect(() => {
    setFormElementInState(formRef.current);
  }, [setFormElementInState]);
  (0, import_react8.useEffect)(() => {
    var _a2;
    setFieldErrors((_a2 = backendError == null ? void 0 : backendError.fieldErrors) != null ? _a2 : {});
    if (!disableFocusOnError && (backendError == null ? void 0 : backendError.fieldErrors)) {
      focusFirstInvalidInput(
        backendError.fieldErrors,
        customFocusHandlers(),
        formRef.current
      );
    }
  }, [
    backendError == null ? void 0 : backendError.fieldErrors,
    customFocusHandlers,
    disableFocusOnError,
    setFieldErrors,
    setFieldError
  ]);
  useSubmitComplete(hasActiveSubmission, () => {
    endSubmit();
  });
  const handleSubmit = async (e, target, nativeEvent) => {
    startSubmit();
    const submitter = nativeEvent.submitter;
    const formMethod = (submitter == null ? void 0 : submitter.formMethod) || method;
    const formData2 = getDataFromForm(target);
    if (submitter == null ? void 0 : submitter.name) {
      formData2.append(submitter.name, submitter.value);
    }
    const result = await validator2.validate(formData2);
    if (result.error) {
      setFieldErrors(result.error.fieldErrors);
      endSubmit();
      if (!disableFocusOnError) {
        focusFirstInvalidInput(
          result.error.fieldErrors,
          customFocusHandlers(),
          formRef.current
        );
      }
    } else {
      setFieldErrors({});
      const eventProxy = formEventProxy(e);
      await (onSubmit == null ? void 0 : onSubmit(result.data, eventProxy));
      if (eventProxy.defaultPrevented) {
        endSubmit();
        return;
      }
      const opts = {
        method: formMethod,
        replace: replace22,
        preventScrollReset,
        relative,
        action,
        encType
      };
      if (fetcher)
        fetcher.submit(formData2, opts);
      else
        submit(formData2, opts);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Form2,
    {
      ref: mergeRefs([formRef, formRefProp]),
      ...rest,
      id,
      action,
      method,
      encType,
      replace: replace22,
      preventScrollReset,
      relative,
      onSubmit: (e) => {
        e.preventDefault();
        handleSubmit(
          e,
          e.currentTarget,
          e.nativeEvent
        );
      },
      onReset: (event) => {
        onReset == null ? void 0 : onReset(event);
        if (event.defaultPrevented)
          return;
        reset();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InternalFormContext.Provider, { value: contextValue, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FormResetter, { formRef, resetAfterSubmit }),
        subaction && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "hidden", value: subaction, name: "subaction" }),
        id && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "hidden", value: id, name: FORM_ID_FIELD }),
        children
      ] }) })
    }
  );
}
var objectFromPathEntries = (entries2) => {
  const map = new MultiValueMap();
  entries2.forEach(([key, value]) => map.add(key, value));
  return [...map.entries()].reduce(
    (acc, [key, value]) => setPath(acc, key, value.length === 1 ? value[0] : value),
    {}
  );
};
var preprocessFormData = (data) => {
  if ("entries" in data && typeof data.entries === "function")
    return objectFromPathEntries([...data.entries()]);
  return objectFromPathEntries(Object.entries(data));
};
var omitInternalFields = (data) => omit(data, [FORM_ID_FIELD]);
function createValidator(validator2) {
  return {
    validate: async (value) => {
      const data = preprocessFormData(value);
      const result = await validator2.validate(omitInternalFields(data));
      if (result.error) {
        return {
          data: void 0,
          error: {
            fieldErrors: result.error,
            subaction: data.subaction,
            formId: data[FORM_ID_FIELD]
          },
          submittedData: data,
          formId: data[FORM_ID_FIELD]
        };
      }
      return {
        data: result.data,
        error: void 0,
        submittedData: data,
        formId: data[FORM_ID_FIELD]
      };
    },
    validateField: (data, field) => validator2.validateField(preprocessFormData(data), field)
  };
}
var useFormState = (formId) => {
  const formContext = useInternalFormContext(formId, "useFormState");
  const isSubmitting = useInternalIsSubmitting(formContext.formId);
  const hasBeenSubmitted = useInternalHasBeenSubmitted(formContext.formId);
  const touchedFields = useTouchedFields(formContext.formId);
  const isValid = useInternalIsValid(formContext.formId);
  const action = useFormActionProp(formContext.formId);
  const subaction = useFormSubactionProp(formContext.formId);
  const syncedDefaultValues = useSyncedDefaultValues(formContext.formId);
  const defaultValuesToUse = useDefaultValuesForForm(formContext);
  const hydratedDefaultValues = defaultValuesToUse.hydrateTo(syncedDefaultValues);
  const fieldErrorsFromState = useFieldErrors(formContext.formId);
  const fieldErrorsToUse = useFieldErrorsForForm(formContext);
  const hydratedFieldErrors = fieldErrorsToUse.hydrateTo(fieldErrorsFromState);
  return (0, import_react13.useMemo)(
    () => ({
      action,
      subaction,
      defaultValues: hydratedDefaultValues,
      fieldErrors: hydratedFieldErrors != null ? hydratedFieldErrors : {},
      hasBeenSubmitted,
      isSubmitting,
      touchedFields,
      isValid
    }),
    [
      action,
      hasBeenSubmitted,
      hydratedDefaultValues,
      hydratedFieldErrors,
      isSubmitting,
      isValid,
      subaction,
      touchedFields
    ]
  );
};
var useFormHelpers = (formId) => {
  const formContext = useInternalFormContext(formId, "useFormHelpers");
  const setTouched = useSetTouched(formContext);
  const validateField = useSmartValidate(formContext.formId);
  const validate = useValidate(formContext.formId);
  const clearError = useClearError(formContext);
  const setFieldErrors = useSetFieldErrors(formContext.formId);
  const reset = useResetFormElement(formContext.formId);
  const submit = useSubmitForm(formContext.formId);
  const getValues = useFormValues(formContext.formId);
  return (0, import_react13.useMemo)(
    () => ({
      setTouched,
      validateField: async (fieldName) => {
        var _a, _b;
        const res = await validateField({
          alwaysIncludeErrorsFromFields: [fieldName]
        });
        return (_b = (_a = res.error) == null ? void 0 : _a.fieldErrors[fieldName]) != null ? _b : null;
      },
      clearError,
      validate,
      clearAllErrors: () => setFieldErrors({}),
      reset,
      submit,
      getValues
    }),
    [
      clearError,
      reset,
      setFieldErrors,
      setTouched,
      submit,
      validate,
      validateField,
      getValues
    ]
  );
};
var useFormContext = (formId) => {
  const context = useInternalFormContext(formId, "useFormContext");
  const state = useFormState(formId);
  const {
    clearError: internalClearError,
    setTouched,
    validateField,
    clearAllErrors,
    validate,
    reset,
    submit,
    getValues
  } = useFormHelpers(formId);
  const registerReceiveFocus = useRegisterReceiveFocus(context.formId);
  const clearError = (0, import_react12.useCallback)(
    (...names) => {
      names.forEach((name) => {
        internalClearError(name);
      });
    },
    [internalClearError]
  );
  return (0, import_react12.useMemo)(
    () => ({
      ...state,
      setFieldTouched: setTouched,
      validateField,
      clearError,
      registerReceiveFocus,
      clearAllErrors,
      validate,
      reset,
      submit,
      getValues
    }),
    [
      clearAllErrors,
      clearError,
      registerReceiveFocus,
      reset,
      setTouched,
      state,
      submit,
      validate,
      validateField,
      getValues
    ]
  );
};
var useInternalFieldArray = (context, field, validationBehavior) => {
  const value = useFieldDefaultValue(field, context);
  useRegisterControlledField(context, field);
  const hasBeenSubmitted = useInternalHasBeenSubmitted(context.formId);
  const validateField = useSmartValidate(context.formId);
  const error = useFieldError(field, context);
  const resolvedValidationBehavior = {
    initial: "onSubmit",
    whenSubmitted: "onChange",
    ...validationBehavior
  };
  const behavior = hasBeenSubmitted ? resolvedValidationBehavior.whenSubmitted : resolvedValidationBehavior.initial;
  const maybeValidate = (0, import_react15.useCallback)(() => {
    if (behavior === "onChange") {
      validateField({ alwaysIncludeErrorsFromFields: [field] });
    }
  }, [behavior, field, validateField]);
  invariant(
    value === void 0 || value === null || Array.isArray(value),
    `FieldArray: defaultValue value for ${field} must be an array, null, or undefined`
  );
  const arr = useFormStore(
    context.formId,
    (state) => state.controlledFields.array
  );
  const arrayValue = (0, import_react14.useMemo)(() => value != null ? value : [], [value]);
  const keyRef = (0, import_react14.useRef)([]);
  if (keyRef.current.length !== arrayValue.length) {
    keyRef.current = arrayValue.map(() => nanoid());
  }
  const helpers = (0, import_react14.useMemo)(
    () => ({
      push: (item) => {
        arr.push(field, item);
        keyRef.current.push(nanoid());
        maybeValidate();
      },
      swap: (indexA, indexB) => {
        arr.swap(field, indexA, indexB);
        swap(keyRef.current, indexA, indexB);
        maybeValidate();
      },
      move: (from2, to) => {
        arr.move(field, from2, to);
        move(keyRef.current, from2, to);
        maybeValidate();
      },
      insert: (index, value2) => {
        arr.insert(field, index, value2);
        insert(keyRef.current, index, nanoid());
        maybeValidate();
      },
      unshift: (value2) => {
        arr.unshift(field, value2);
        keyRef.current.unshift(nanoid());
        maybeValidate();
      },
      remove: (index) => {
        arr.remove(field, index);
        remove(keyRef.current, index);
        maybeValidate();
      },
      pop: () => {
        arr.pop(field);
        keyRef.current.pop();
        maybeValidate();
      },
      replace: (index, value2) => {
        arr.replace(field, index, value2);
        keyRef.current[index] = nanoid();
        maybeValidate();
      }
    }),
    [arr, field, maybeValidate]
  );
  const valueWithKeys = (0, import_react14.useMemo)(() => {
    const result = [];
    arrayValue.forEach((item, index) => {
      result[index] = {
        key: keyRef.current[index],
        defaultValue: item
      };
    });
    return result;
  }, [arrayValue]);
  return [valueWithKeys, helpers, error];
};
function useFieldArray(name, { formId, validationBehavior } = {}) {
  const context = useInternalFormContext(formId, "FieldArray");
  return useInternalFieldArray(context, name, validationBehavior);
}

// node_modules/@remix-validated-form/with-zod/dist/index.esm.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS2 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var require_lodash2 = __commonJS2({
  "../../node_modules/lodash.get/index.js"(exports, module) {
    var FUNC_ERROR_TEXT = "Expected a function";
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var INFINITY = 1 / 0;
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var symbolTag = "[object Symbol]";
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    var reLeadingDot = /^\./;
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reEscapeChar = /\\(\\)?/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var freeGlobal = typeof globalThis == "object" && globalThis && globalThis.Object === Object && globalThis;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var maskSrcKey = function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    }();
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Symbol2 = root.Symbol;
    var splice = arrayProto.splice;
    var Map2 = getNative(root, "Map");
    var nativeCreate = getNative(Object, "create");
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function Hash(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
    }
    function hashDelete(key) {
      return this.has(key) && delete this.__data__[key];
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      return getMapData(this, key)["delete"](key);
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      getMapData(this, key).set(key, value);
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseGet(object, path) {
      path = isKey(path, object) ? [path] : castPath(path);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function castPath(value) {
      return isArray2(value) ? value : stringToPath(value);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    function isKey(value, object) {
      if (isArray2(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    var stringToPath = memoize(function(string) {
      string = toString(string);
      var result = [];
      if (reLeadingDot.test(string)) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, string2) {
        result.push(quote ? string2.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function memoize(func, resolver) {
      if (typeof func != "function" || resolver && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
        if (cache.has(key)) {
          return cache.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache.set(key, result);
        return result;
      };
      memoized.cache = new (memoize.Cache || MapCache)();
      return memoized;
    }
    memoize.Cache = MapCache;
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    var isArray2 = Array.isArray;
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    function get2(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get2;
  }
});
var __spreadArray2 = function(to, from2, pack) {
  if (pack || arguments.length === 2)
    for (var i2 = 0, l2 = from2.length, ar; i2 < l2; i2++) {
      if (ar || !(i2 in from2)) {
        if (!ar)
          ar = Array.prototype.slice.call(from2, 0, i2);
        ar[i2] = from2[i2];
      }
    }
  return to.concat(ar || Array.prototype.slice.call(from2));
};
function purry2(fn2, args, lazy) {
  var diff = fn2.length - args.length;
  var arrayArgs = Array.from(args);
  if (diff === 0) {
    return fn2.apply(void 0, arrayArgs);
  }
  if (diff === 1) {
    var ret = function(data) {
      return fn2.apply(void 0, __spreadArray2([data], arrayArgs, false));
    };
    if (lazy || fn2.lazy) {
      ret.lazy = lazy || fn2.lazy;
      ret.lazyArgs = args;
    }
    return ret;
  }
  throw new Error("Wrong number of arguments");
}
var isArray = Array.isArray;
var keyList = Object.keys;
var hasProp = Object.prototype.hasOwnProperty;
function equals2() {
  return purry2(_equals2, arguments);
}
function _equals2(a2, b2) {
  if (a2 === b2) {
    return true;
  }
  if (a2 && b2 && typeof a2 === "object" && typeof b2 === "object") {
    var arrA = isArray(a2);
    var arrB = isArray(b2);
    var i2 = void 0;
    var length = void 0;
    var key = void 0;
    if (arrA && arrB) {
      length = a2.length;
      if (length !== b2.length) {
        return false;
      }
      for (i2 = length; i2-- !== 0; ) {
        if (!equals2(a2[i2], b2[i2])) {
          return false;
        }
      }
      return true;
    }
    if (arrA !== arrB) {
      return false;
    }
    var dateA = a2 instanceof Date;
    var dateB = b2 instanceof Date;
    if (dateA !== dateB) {
      return false;
    }
    if (dateA && dateB) {
      return a2.getTime() === b2.getTime();
    }
    var regexpA = a2 instanceof RegExp;
    var regexpB = b2 instanceof RegExp;
    if (regexpA !== regexpB) {
      return false;
    }
    if (regexpA && regexpB) {
      return a2.toString() === b2.toString();
    }
    var keys2 = keyList(a2);
    length = keys2.length;
    if (length !== keyList(b2).length) {
      return false;
    }
    for (i2 = length; i2-- !== 0; ) {
      if (!hasProp.call(b2, keys2[i2])) {
        return false;
      }
    }
    for (i2 = length; i2-- !== 0; ) {
      key = keys2[i2];
      if (!equals2(a2[key], b2[key])) {
        return false;
      }
    }
    return true;
  }
  return a2 !== a2 && b2 !== b2;
}
var stringToPathArray2 = (path) => {
  if (path.length === 0)
    return [];
  const match = path.match(/^\[(.+?)\](.*)$/) || path.match(/^\.?([^\.\[\]]+)(.*)$/);
  if (match) {
    const [_2, key, rest] = match;
    return [/^\d+$/.test(key) ? Number(key) : key, ...stringToPathArray2(rest)];
  }
  return [path];
};
var import_lodash2 = __toESM2(require_lodash2());
var getIssuesForError = (err) => {
  return err.issues.flatMap((issue) => {
    if ("unionErrors" in issue) {
      return issue.unionErrors.flatMap((err2) => getIssuesForError(err2));
    } else {
      return [issue];
    }
  });
};
function pathToString(array) {
  return array.reduce(function(string, item) {
    const prefix2 = string === "" ? "" : ".";
    return string + (isNaN(Number(item)) ? prefix2 + item : "[" + item + "]");
  }, "");
}
function withZod(zodSchema, parseParams) {
  return createValidator({
    validate: async (value) => {
      const result = await zodSchema.safeParseAsync(value, parseParams);
      if (result.success)
        return { data: result.data, error: void 0 };
      const fieldErrors = {};
      getIssuesForError(result.error).forEach((issue) => {
        const path = pathToString(issue.path);
        if (!fieldErrors[path])
          fieldErrors[path] = issue.message;
      });
      return { error: fieldErrors, data: void 0 };
    },
    validateField: async (data, field) => {
      var _a;
      const result = await zodSchema.safeParseAsync(data, parseParams);
      if (result.success)
        return { error: void 0 };
      return {
        error: (_a = getIssuesForError(result.error).find(
          (issue) => equals2(issue.path, stringToPathArray2(field))
        )) == null ? void 0 : _a.message
      };
    }
  });
}

// node_modules/zod-form-data/dist/index.mjs
var __create2 = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __getProtoOf2 = Object.getPrototypeOf;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __commonJS3 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var __copyProps2 = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames2(from2))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc2(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toESM3 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(
  isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var require_lodash3 = __commonJS3({
  "../../node_modules/lodash.get/index.js"(exports, module) {
    var FUNC_ERROR_TEXT = "Expected a function";
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var INFINITY = 1 / 0;
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var symbolTag = "[object Symbol]";
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    var reLeadingDot = /^\./;
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reEscapeChar = /\\(\\)?/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var freeGlobal = typeof globalThis == "object" && globalThis && globalThis.Object === Object && globalThis;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var maskSrcKey = function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    }();
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Symbol2 = root.Symbol;
    var splice = arrayProto.splice;
    var Map2 = getNative(root, "Map");
    var nativeCreate = getNative(Object, "create");
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function Hash(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
    }
    function hashDelete(key) {
      return this.has(key) && delete this.__data__[key];
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries2) {
      var index = -1, length = entries2 ? entries2.length : 0;
      this.clear();
      while (++index < length) {
        var entry = entries2[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      return getMapData(this, key)["delete"](key);
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      getMapData(this, key).set(key, value);
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseGet(object, path) {
      path = isKey(path, object) ? [path] : castPath(path);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) || isHostObject(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function castPath(value) {
      return isArray2(value) ? value : stringToPath(value);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    function isKey(value, object) {
      if (isArray2(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    var stringToPath = memoize(function(string) {
      string = toString(string);
      var result = [];
      if (reLeadingDot.test(string)) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, string2) {
        result.push(quote ? string2.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function memoize(func, resolver) {
      if (typeof func != "function" || resolver && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
        if (cache.has(key)) {
          return cache.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache.set(key, result);
        return result;
      };
      memoized.cache = new (memoize.Cache || MapCache)();
      return memoized;
    }
    memoize.Cache = MapCache;
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    var isArray2 = Array.isArray;
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    function get2(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get2;
  }
});
var helpers_exports = {};
__export(helpers_exports, {
  checkbox: () => checkbox,
  file: () => file,
  formData: () => formData,
  json: () => json,
  numeric: () => numeric,
  preprocessFormData: () => preprocessFormData2,
  repeatable: () => repeatable,
  repeatableOfType: () => repeatableOfType,
  text: () => text
});
var stringToPathArray3 = (path) => {
  if (path.length === 0)
    return [];
  const match = path.match(/^\[(.+?)\](.*)$/) || path.match(/^\.?([^\.\[\]]+)(.*)$/);
  if (match) {
    const [_2, key, rest] = match;
    return [/^\d+$/.test(key) ? Number(key) : key, ...stringToPathArray3(rest)];
  }
  return [path];
};
function setPath2(object, path, defaultValue) {
  return _setPathNormalized2(object, stringToPathArray3(path), defaultValue);
}
function _setPathNormalized2(object, path, value) {
  var _a;
  const leadingSegments = path.slice(0, -1);
  const lastSegment = path[path.length - 1];
  let obj = object;
  for (let i2 = 0; i2 < leadingSegments.length; i2++) {
    const segment = leadingSegments[i2];
    if (obj[segment] === void 0) {
      const nextSegment = (_a = leadingSegments[i2 + 1]) != null ? _a : lastSegment;
      obj[segment] = typeof nextSegment === "number" ? [] : {};
    }
    obj = obj[segment];
  }
  obj[lastSegment] = value;
  return object;
}
var import_lodash3 = __toESM3(require_lodash3());
var stripEmpty = z.literal("").transform(() => void 0);
var preprocessIfValid = (schema) => (val) => {
  const result = schema.safeParse(val);
  if (result.success)
    return result.data;
  return val;
};
var text = (schema = z.string()) => z.preprocess(preprocessIfValid(stripEmpty), schema);
var numeric = (schema = z.number()) => z.preprocess(
  preprocessIfValid(
    z.union([
      stripEmpty,
      z.string().transform((val) => Number(val)).refine((val) => !Number.isNaN(val))
    ])
  ),
  schema
);
var checkbox = ({ trueValue = "on" } = {}) => z.union([
  z.literal(trueValue).transform(() => true),
  z.literal(void 0).transform(() => false)
]);
var file = (schema = z.instanceof(File)) => z.preprocess((val) => {
  return val instanceof File && val.size === 0 ? void 0 : val;
}, schema);
var repeatable = (schema = z.array(text())) => {
  return z.preprocess((val) => {
    if (Array.isArray(val))
      return val;
    if (val === void 0)
      return [];
    return [val];
  }, schema);
};
var repeatableOfType = (schema) => repeatable(z.array(schema));
var entries = z.array(z.tuple([z.string(), z.any()]));
var safeParseJson = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch {
    return jsonString;
  }
};
var json = (schema) => z.preprocess(
  preprocessIfValid(
    z.union([stripEmpty, z.string().transform((val) => safeParseJson(val))])
  ),
  schema
);
var processFormData = preprocessIfValid(
  z.any().refine((val) => Symbol.iterator in val).transform((val) => [...val]).refine(
    (val) => entries.safeParse(val).success
  ).transform((data) => {
    const map = /* @__PURE__ */ new Map();
    for (const [key, value] of data) {
      if (map.has(key)) {
        map.get(key).push(value);
      } else {
        map.set(key, [value]);
      }
    }
    return [...map.entries()].reduce((acc, [key, value]) => {
      return setPath2(acc, key, value.length === 1 ? value[0] : value);
    }, {});
  })
);
var preprocessFormData2 = processFormData;
var formData = (shapeOrSchema) => z.preprocess(
  processFormData,
  shapeOrSchema instanceof ZodType ? shapeOrSchema : z.object(shapeOrSchema)
);

// app/components/forms/form-input-2.tsx
var import_react16 = __toESM(require_react(), 1);
var import_jsx_dev_runtime = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-input-2.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-input-2.tsx"
  );
  import.meta.hot.lastModified = "1710533035894.1108";
}
function FormInput({
  label,
  labelInfo,
  hideLabel,
  className,
  helperText,
  name,
  ...props
}) {
  _s();
  const fallbackId = (0, import_react16.useId)();
  const id = props.id ?? fallbackId;
  const {
    error,
    getInputProps
  } = useField(name);
  const errorId = error?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
    labelInfo ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("label", { htmlFor: id, children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("span", { className: "flex items-center gap-2", children: [
      label ?? startCase(name),
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "max-w-[300px]", children: labelInfo }, void 0, false, {
        fileName: "app/components/forms/form-input-2.tsx",
        lineNumber: 51,
        columnNumber: 22
      }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
        fileName: "app/components/forms/form-input-2.tsx",
        lineNumber: 52,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-input-2.tsx",
        lineNumber: 51,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 49,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 48,
      columnNumber: 17
    }, this) : hideLabel ? null : /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("label", { htmlFor: id, children: label ?? startCase(name) }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 55,
      columnNumber: 35
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(Input, { "aria-invalid": errorId ? true : void 0, "aria-describedby": errorId, variant: errorId ? "destructive" : void 0, ...getInputProps({
      id,
      ...props
    }) }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 56,
      columnNumber: 4
    }, this),
    helperText ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("p", { className: "text-muted-foreground", children: helperText }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 60,
      columnNumber: 18
    }, this) : null,
    /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)("div", { children: errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime.jsxDEV)(ErrorList, { id: errorId, errors: [error] }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 61,
      columnNumber: 20
    }, this) : null }, void 0, false, {
      fileName: "app/components/forms/form-input-2.tsx",
      lineNumber: 61,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-input-2.tsx",
    lineNumber: 47,
    columnNumber: 10
  }, this);
}
_s(FormInput, "QOHspPdh8P3Uiiuh8BB+NkygXIg=", false, function() {
  return [import_react16.useId, useField];
});
_c = FormInput;
var _c;
$RefreshReg$(_c, "FormInput");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-search-select.tsx
var import_react17 = __toESM(require_react(), 1);

// app/utils/pluralize/pluralize.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/pluralize/pluralize.ts"
  );
  import.meta.hot.lastModified = "1710422932743.0435";
}
var pluralRules = [];
var singularRules = [];
var uncountables = {};
var irregularPlurals = {};
var irregularSingles = {};
function sanitizeRule(rule) {
  if (typeof rule === "string") {
    return new RegExp("^" + rule + "$", "i");
  }
  return rule;
}
function restoreCase(word, token) {
  if (word === token)
    return token;
  if (word === word.toLowerCase())
    return token.toLowerCase();
  if (word === word.toUpperCase())
    return token.toUpperCase();
  if (word[0] === word[0].toUpperCase()) {
    return token.charAt(0).toUpperCase() + token.substr(1).toLowerCase();
  }
  return token.toLowerCase();
}
function interpolate(str, args) {
  return str.replace(/\$(\d{1,2})/g, function(match, index) {
    return args[index] || "";
  });
}
function replace2(word, rule) {
  return word.replace(rule[0], function(match, index) {
    var result = interpolate(rule[1], arguments);
    if (match === "") {
      return restoreCase(word[index - 1], result);
    }
    return restoreCase(match, result);
  });
}
function sanitizeWord(token, word, rules) {
  if (!token.length || uncountables.hasOwnProperty(token)) {
    return word;
  }
  var len = rules.length;
  while (len--) {
    var rule = rules[len];
    if (rule[0].test(word))
      return replace2(word, rule);
  }
  return word;
}
function replaceWord(replaceMap, keepMap, rules) {
  return function(word) {
    var token = word.toLowerCase();
    if (keepMap.hasOwnProperty(token)) {
      return restoreCase(word, token);
    }
    if (replaceMap.hasOwnProperty(token)) {
      return restoreCase(word, replaceMap[token]);
    }
    return sanitizeWord(token, word, rules);
  };
}
function checkWord(replaceMap, keepMap, rules, bool) {
  return function(word) {
    var token = word.toLowerCase();
    if (keepMap.hasOwnProperty(token))
      return true;
    if (replaceMap.hasOwnProperty(token))
      return false;
    return sanitizeWord(token, token, rules) === token;
  };
}
function pluralize(word, count, inclusive) {
  var pluralized = count === 1 ? pluralize.singular(word) : pluralize.plural(word);
  return (inclusive ? count + " " : "") + pluralized;
}
pluralize.plural = replaceWord(irregularSingles, irregularPlurals, pluralRules);
pluralize.isPlural = checkWord(irregularSingles, irregularPlurals, pluralRules);
pluralize.singular = replaceWord(
  irregularPlurals,
  irregularSingles,
  singularRules
);
pluralize.isSingular = checkWord(
  irregularPlurals,
  irregularSingles,
  singularRules
);
pluralize.addPluralRule = function(rule, replacement) {
  pluralRules.push([sanitizeRule(rule), replacement]);
};
pluralize.addSingularRule = function(rule, replacement) {
  singularRules.push([sanitizeRule(rule), replacement]);
};
pluralize.addUncountableRule = function(word) {
  if (typeof word === "string") {
    uncountables[word.toLowerCase()] = true;
    return;
  }
  pluralize.addPluralRule(word, "$0");
  pluralize.addSingularRule(word, "$0");
};
pluralize.addIrregularRule = function(single, plural) {
  plural = plural.toLowerCase();
  single = single.toLowerCase();
  irregularSingles[single] = plural;
  irregularPlurals[plural] = single;
};
[
  // Pronouns.
  ["I", "we"],
  ["me", "us"],
  ["he", "they"],
  ["she", "they"],
  ["them", "them"],
  ["myself", "ourselves"],
  ["yourself", "yourselves"],
  ["itself", "themselves"],
  ["herself", "themselves"],
  ["himself", "themselves"],
  ["themself", "themselves"],
  ["is", "are"],
  ["was", "were"],
  ["has", "have"],
  ["this", "these"],
  ["that", "those"],
  ["my", "our"],
  ["its", "their"],
  ["his", "their"],
  ["her", "their"],
  // Words ending in with a consonant and `o`.
  ["echo", "echoes"],
  ["dingo", "dingoes"],
  ["volcano", "volcanoes"],
  ["tornado", "tornadoes"],
  ["torpedo", "torpedoes"],
  // Ends with `us`.
  ["genus", "genera"],
  ["viscus", "viscera"],
  // Ends with `ma`.
  ["stigma", "stigmata"],
  ["stoma", "stomata"],
  ["dogma", "dogmata"],
  ["lemma", "lemmata"],
  ["schema", "schemata"],
  ["anathema", "anathemata"],
  // Other irregular rules.
  ["ox", "oxen"],
  ["axe", "axes"],
  ["die", "dice"],
  ["yes", "yeses"],
  ["foot", "feet"],
  ["eave", "eaves"],
  ["goose", "geese"],
  ["tooth", "teeth"],
  ["quiz", "quizzes"],
  ["human", "humans"],
  ["proof", "proofs"],
  ["carve", "carves"],
  ["valve", "valves"],
  ["looey", "looies"],
  ["thief", "thieves"],
  ["groove", "grooves"],
  ["pickaxe", "pickaxes"],
  ["passerby", "passersby"],
  ["canvas", "canvases"]
].forEach(function(rule) {
  return pluralize.addIrregularRule(rule[0], rule[1]);
});
[
  [/s?$/i, "s"],
  [/[^\u0000-\u007F]$/i, "$0"],
  [/([^aeiou]ese)$/i, "$1"],
  [/(ax|test)is$/i, "$1es"],
  [/(alias|[^aou]us|t[lm]as|gas|ris)$/i, "$1es"],
  [/(e[mn]u)s?$/i, "$1s"],
  [/([^l]ias|[aeiou]las|[ejzr]as|[iu]am)$/i, "$1"],
  [
    /(alumn|syllab|vir|radi|nucle|fung|cact|stimul|termin|bacill|foc|uter|loc|strat)(?:us|i)$/i,
    "$1i"
  ],
  [/(alumn|alg|vertebr)(?:a|ae)$/i, "$1ae"],
  [/(seraph|cherub)(?:im)?$/i, "$1im"],
  [/(her|at|gr)o$/i, "$1oes"],
  [
    /(agend|addend|millenni|dat|extrem|bacteri|desiderat|strat|candelabr|errat|ov|symposi|curricul|automat|quor)(?:a|um)$/i,
    "$1a"
  ],
  [
    /(apheli|hyperbat|periheli|asyndet|noumen|phenomen|criteri|organ|prolegomen|hedr|automat)(?:a|on)$/i,
    "$1a"
  ],
  [/sis$/i, "ses"],
  [/(?:(kni|wi|li)fe|(ar|l|ea|eo|oa|hoo)f)$/i, "$1$2ves"],
  [/([^aeiouy]|qu)y$/i, "$1ies"],
  [/([^ch][ieo][ln])ey$/i, "$1ies"],
  [/(x|ch|ss|sh|zz)$/i, "$1es"],
  [/(matr|cod|mur|sil|vert|ind|append)(?:ix|ex)$/i, "$1ices"],
  [/\b((?:tit)?m|l)(?:ice|ouse)$/i, "$1ice"],
  [/(pe)(?:rson|ople)$/i, "$1ople"],
  [/(child)(?:ren)?$/i, "$1ren"],
  [/eaux$/i, "$0"],
  [/m[ae]n$/i, "men"],
  ["thou", "you"]
].forEach(function(rule) {
  return pluralize.addPluralRule(rule[0], rule[1]);
});
[
  [/s$/i, ""],
  [/(ss)$/i, "$1"],
  [/(wi|kni|(?:after|half|high|low|mid|non|night|[^\w]|^)li)ves$/i, "$1fe"],
  [/(ar|(?:wo|[ae])l|[eo][ao])ves$/i, "$1f"],
  [/ies$/i, "y"],
  [/(dg|ss|ois|lk|ok|wn|mb|th|ch|ec|oal|is|ck|ix|sser|ts|wb)ies$/i, "$1ie"],
  [
    /\b(l|(?:neck|cross|hog|aun)?t|coll|faer|food|gen|goon|group|hipp|junk|vegg|(?:pork)?p|charl|calor|cut)ies$/i,
    "$1ie"
  ],
  [/\b(mon|smil)ies$/i, "$1ey"],
  [/\b((?:tit)?m|l)ice$/i, "$1ouse"],
  [/(seraph|cherub)im$/i, "$1"],
  [
    /(x|ch|ss|sh|zz|tto|go|cho|alias|[^aou]us|t[lm]as|gas|(?:her|at|gr)o|[aeiou]ris)(?:es)?$/i,
    "$1"
  ],
  [
    /(analy|diagno|parenthe|progno|synop|the|empha|cri|ne)(?:sis|ses)$/i,
    "$1sis"
  ],
  [/(movie|twelve|abuse|e[mn]u)s$/i, "$1"],
  [/(test)(?:is|es)$/i, "$1is"],
  [
    /(alumn|syllab|vir|radi|nucle|fung|cact|stimul|termin|bacill|foc|uter|loc|strat)(?:us|i)$/i,
    "$1us"
  ],
  [
    /(agend|addend|millenni|dat|extrem|bacteri|desiderat|strat|candelabr|errat|ov|symposi|curricul|quor)a$/i,
    "$1um"
  ],
  [
    /(apheli|hyperbat|periheli|asyndet|noumen|phenomen|criteri|organ|prolegomen|hedr|automat)a$/i,
    "$1on"
  ],
  [/(alumn|alg|vertebr)ae$/i, "$1a"],
  [/(cod|mur|sil|vert|ind)ices$/i, "$1ex"],
  [/(matr|append)ices$/i, "$1ix"],
  [/(pe)(rson|ople)$/i, "$1rson"],
  [/(child)ren$/i, "$1"],
  [/(eau)x?$/i, "$1"],
  [/men$/i, "man"]
].forEach(function(rule) {
  return pluralize.addSingularRule(rule[0], rule[1]);
});
[
  // Singular words with no plurals.
  "adulthood",
  "advice",
  "agenda",
  "aid",
  "aircraft",
  "alcohol",
  "ammo",
  "analytics",
  "anime",
  "athletics",
  "audio",
  "bison",
  "blood",
  "bream",
  "buffalo",
  "butter",
  "carp",
  "cash",
  "chassis",
  "chess",
  "clothing",
  "cod",
  "commerce",
  "cooperation",
  "corps",
  "debris",
  "diabetes",
  "digestion",
  "elk",
  "energy",
  "equipment",
  "excretion",
  "expertise",
  "firmware",
  "flounder",
  "fun",
  "gallows",
  "garbage",
  "graffiti",
  "hardware",
  "headquarters",
  "health",
  "herpes",
  "highjinks",
  "homework",
  "housework",
  "information",
  "jeans",
  "justice",
  "kudos",
  "labour",
  "literature",
  "machinery",
  "mackerel",
  "mail",
  "media",
  "mews",
  "moose",
  "music",
  "mud",
  "manga",
  "news",
  "only",
  "personnel",
  "pike",
  "plankton",
  "pliers",
  "police",
  "pollution",
  "premises",
  "rain",
  "research",
  "rice",
  "salmon",
  "scissors",
  "series",
  "sewage",
  "shambles",
  "shrimp",
  "software",
  "staff",
  "swine",
  "tennis",
  "traffic",
  "transportation",
  "trout",
  "tuna",
  "wealth",
  "welfare",
  "whiting",
  "wildebeest",
  "wildlife",
  "you",
  /pok[eé]mon$/i,
  // Regexes.
  /[^aeiou]ese$/i,
  // "chinese", "japanese"
  /deer$/i,
  // "deer", "reindeer"
  /fish$/i,
  // "fish", "blowfish", "angelfish"
  /measles$/i,
  /o[iu]s$/i,
  // "carnivorous"
  /pox$/i,
  // "chickpox", "smallpox"
  /sheep$/i
].forEach(pluralize.addUncountableRule);
var pluralize_default = pluralize;

// app/components/forms/form-search-select.tsx
var import_jsx_dev_runtime2 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-search-select.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s2 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-search-select.tsx"
  );
  import.meta.hot.lastModified = "1710425363351.6436";
}
function FormSearchSelect({
  id: initialId,
  entity = "item",
  options,
  label,
  labelInfo,
  hideLabel,
  className,
  helperText,
  name
}) {
  _s2();
  const fallbackId = (0, import_react17.useId)();
  const id = initialId ?? fallbackId;
  const {
    error
  } = useField(name);
  const [open, setOpen] = (0, import_react17.useState)(false);
  const [value, setValue] = useControlField(name);
  const optLabel = options.find((opt) => opt.value === value)?.label;
  const errorId = error?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
    labelInfo ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { htmlFor: id, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("span", { className: "flex items-center gap-2", children: [
      label ?? startCase(name),
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "max-w-[300px]", children: labelInfo }, void 0, false, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 59,
        columnNumber: 22
      }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 60,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 59,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 57,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 56,
      columnNumber: 17
    }, this) : hideLabel ? null : /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("label", { htmlFor: id, children: label ?? startCase(name) }, void 0, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 63,
      columnNumber: 35
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("input", { type: "hidden", name, value }, value, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 64,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Popover, { open, onOpenChange: setOpen, children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(PopoverTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Button, { variant: "outline", role: "combobox", "aria-expanded": open, className: "w-full justify-between text-sm", children: [
        optLabel || `Select ${entity}...`,
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ChevronsUpDown, { className: "h-4" }, void 0, false, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 69,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 67,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 66,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(PopoverContent, { className: "w-[320px] p-0", align: "start", children: /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Command, { children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(CommandInput, { placeholder: `Search ${pluralize_default(entity, 2, false)}...` }, void 0, false, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 74,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(CommandEmpty, { children: "No tutors found." }, void 0, false, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 75,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(CommandGroup, { children: options.length ? options.map(({
          label: label2,
          value: optValue
        }) => /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(CommandItem, { value: optValue, onSelect: (currentValue) => {
          setValue(currentValue === optValue ? "" : currentValue);
          setOpen(false);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(Check, { className: cn("mr-2 h-4 w-4", value === optValue ? "opacity-100" : "opacity-0") }, void 0, false, {
            fileName: "app/components/forms/form-search-select.tsx",
            lineNumber: 84,
            columnNumber: 11
          }, this),
          label2
        ] }, optValue, true, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 80,
          columnNumber: 19
        }, this)) : /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "w-full p-2 text-center text-sm text-muted-foreground", children: "Not tutors found" }, void 0, false, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 86,
          columnNumber: 28
        }, this) }, void 0, false, {
          fileName: "app/components/forms/form-search-select.tsx",
          lineNumber: 76,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 73,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-search-select.tsx",
        lineNumber: 72,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 65,
      columnNumber: 4
    }, this),
    helperText ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("p", { className: "text-muted-foreground", children: helperText }, void 0, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 93,
      columnNumber: 18
    }, this) : null,
    /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)("div", { children: errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime2.jsxDEV)(ErrorList, { id: errorId, errors: [error] }, void 0, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 94,
      columnNumber: 20
    }, this) : null }, void 0, false, {
      fileName: "app/components/forms/form-search-select.tsx",
      lineNumber: 94,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-search-select.tsx",
    lineNumber: 55,
    columnNumber: 10
  }, this);
}
_s2(FormSearchSelect, "tQrN6r0ph1jndnHzq6BkEQl2CNI=", false, function() {
  return [import_react17.useId, useField, useControlField];
});
_c2 = FormSearchSelect;
var _c2;
$RefreshReg$(_c2, "FormSearchSelect");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-textarea-2.tsx
var import_react18 = __toESM(require_react(), 1);
var import_jsx_dev_runtime3 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-textarea-2.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s3 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-textarea-2.tsx"
  );
  import.meta.hot.lastModified = "1710533043225.4258";
}
function Base({
  label,
  labelInfo,
  hideLabel,
  className,
  helperText,
  name,
  subLabel,
  ...props
}, ref) {
  _s3();
  const fallbackId = (0, import_react18.useId)();
  const id = props.id ?? fallbackId;
  const {
    error,
    getInputProps
  } = useField(name);
  const errorId = error?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
    labelInfo ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("label", { htmlFor: id, children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("span", { className: "flex items-center gap-2", children: [
      label ?? startCase(name),
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { className: "max-w-[300px]", children: labelInfo }, void 0, false, {
        fileName: "app/components/forms/form-textarea-2.tsx",
        lineNumber: 52,
        columnNumber: 22
      }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
        fileName: "app/components/forms/form-textarea-2.tsx",
        lineNumber: 53,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-textarea-2.tsx",
        lineNumber: 52,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 50,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 49,
      columnNumber: 17
    }, this) : hideLabel ? null : /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("label", { htmlFor: id, children: label ?? startCase(name) }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 56,
      columnNumber: 35
    }, this),
    subLabel ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { className: "text-muted-foreground", children: subLabel }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 57,
      columnNumber: 16
    }, this) : null,
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(Textarea, { id, ref, "aria-invalid": errorId ? true : void 0, "aria-describedby": errorId, color: errorId ? "red" : void 0, ...getInputProps({
      id,
      ...props
    }) }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 58,
      columnNumber: 4
    }, this),
    helperText ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("p", { className: "text-muted-foreground", children: helperText }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 62,
      columnNumber: 18
    }, this) : null,
    /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)("div", { children: errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime3.jsxDEV)(ErrorList, { id: errorId, errors: [error] }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 63,
      columnNumber: 20
    }, this) : null }, void 0, false, {
      fileName: "app/components/forms/form-textarea-2.tsx",
      lineNumber: 63,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-textarea-2.tsx",
    lineNumber: 48,
    columnNumber: 10
  }, this);
}
_s3(Base, "QOHspPdh8P3Uiiuh8BB+NkygXIg=", false, function() {
  return [import_react18.useId, useField];
});
_c3 = Base;
var FormTextarea = (0, import_react18.forwardRef)(Base);
_c22 = FormTextarea;
var _c3;
var _c22;
$RefreshReg$(_c3, "Base");
$RefreshReg$(_c22, "FormTextarea");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.settings.modules.new/form-instruction.tsx
var import_react24 = __toESM(require_react(), 1);

// app/components/forms/form-radio-group-2.tsx
var import_react20 = __toESM(require_react(), 1);

// node_modules/@radix-ui/react-radio-group/dist/index.mjs
var import_react19 = __toESM(require_react(), 1);
var $ce77a8961b41be9e$var$RADIO_NAME = "Radio";
var [$ce77a8961b41be9e$var$createRadioContext, $ce77a8961b41be9e$export$67d2296460f1b002] = $c512c27ab02ef895$export$50c7b4e9d9f19c1($ce77a8961b41be9e$var$RADIO_NAME);
var [$ce77a8961b41be9e$var$RadioProvider, $ce77a8961b41be9e$var$useRadioContext] = $ce77a8961b41be9e$var$createRadioContext($ce77a8961b41be9e$var$RADIO_NAME);
var $ce77a8961b41be9e$export$d7b12c4107be0d61 = /* @__PURE__ */ (0, import_react19.forwardRef)((props, forwardedRef) => {
  const { __scopeRadio, name, checked = false, required, disabled, value = "on", onCheck, ...radioProps } = props;
  const [button, setButton] = (0, import_react19.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setButton(node)
  );
  const hasConsumerStoppedPropagationRef = (0, import_react19.useRef)(false);
  const isFormControl = button ? Boolean(button.closest("form")) : true;
  return /* @__PURE__ */ (0, import_react19.createElement)($ce77a8961b41be9e$var$RadioProvider, {
    scope: __scopeRadio,
    checked,
    disabled
  }, /* @__PURE__ */ (0, import_react19.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.button, _extends({
    type: "button",
    role: "radio",
    "aria-checked": checked,
    "data-state": $ce77a8961b41be9e$var$getState(checked),
    "data-disabled": disabled ? "" : void 0,
    disabled,
    value
  }, radioProps, {
    ref: composedRefs,
    onClick: $e42e1063c40fb3ef$export$b9ecd428b558ff10(props.onClick, (event) => {
      if (!checked)
        onCheck === null || onCheck === void 0 || onCheck();
      if (isFormControl) {
        hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
        if (!hasConsumerStoppedPropagationRef.current)
          event.stopPropagation();
      }
    })
  })), isFormControl && /* @__PURE__ */ (0, import_react19.createElement)($ce77a8961b41be9e$var$BubbleInput, {
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
var $ce77a8961b41be9e$var$INDICATOR_NAME = "RadioIndicator";
var $ce77a8961b41be9e$export$d35a9ffa9a04f9e7 = /* @__PURE__ */ (0, import_react19.forwardRef)((props, forwardedRef) => {
  const { __scopeRadio, forceMount, ...indicatorProps } = props;
  const context = $ce77a8961b41be9e$var$useRadioContext($ce77a8961b41be9e$var$INDICATOR_NAME, __scopeRadio);
  return /* @__PURE__ */ (0, import_react19.createElement)($921a889cee6df7e8$export$99c2b779aa4e8b8b, {
    present: forceMount || context.checked
  }, /* @__PURE__ */ (0, import_react19.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    "data-state": $ce77a8961b41be9e$var$getState(context.checked),
    "data-disabled": context.disabled ? "" : void 0
  }, indicatorProps, {
    ref: forwardedRef
  })));
});
var $ce77a8961b41be9e$var$BubbleInput = (props) => {
  const { control, checked, bubbles = true, ...inputProps } = props;
  const ref = (0, import_react19.useRef)(null);
  const prevChecked = $010c2913dbd2fe3d$export$5cae361ad82dce8b(checked);
  const controlSize = $db6c3485150b8e66$export$1ab7ae714698c4b8(control);
  (0, import_react19.useEffect)(() => {
    const input = ref.current;
    const inputProto = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(inputProto, "checked");
    const setChecked = descriptor.set;
    if (prevChecked !== checked && setChecked) {
      const event = new Event("click", {
        bubbles
      });
      setChecked.call(input, checked);
      input.dispatchEvent(event);
    }
  }, [
    prevChecked,
    checked,
    bubbles
  ]);
  return /* @__PURE__ */ (0, import_react19.createElement)("input", _extends({
    type: "radio",
    "aria-hidden": true,
    defaultChecked: checked
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
function $ce77a8961b41be9e$var$getState(checked) {
  return checked ? "checked" : "unchecked";
}
var $f99a8c78507165f7$var$ARROW_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
];
var $f99a8c78507165f7$var$RADIO_GROUP_NAME = "RadioGroup";
var [$f99a8c78507165f7$var$createRadioGroupContext, $f99a8c78507165f7$export$c547093f11b76da2] = $c512c27ab02ef895$export$50c7b4e9d9f19c1($f99a8c78507165f7$var$RADIO_GROUP_NAME, [
  $d7bdfb9eb0fdf311$export$c7109489551a4f4,
  $ce77a8961b41be9e$export$67d2296460f1b002
]);
var $f99a8c78507165f7$var$useRovingFocusGroupScope = $d7bdfb9eb0fdf311$export$c7109489551a4f4();
var $f99a8c78507165f7$var$useRadioScope = $ce77a8961b41be9e$export$67d2296460f1b002();
var [$f99a8c78507165f7$var$RadioGroupProvider, $f99a8c78507165f7$var$useRadioGroupContext] = $f99a8c78507165f7$var$createRadioGroupContext($f99a8c78507165f7$var$RADIO_GROUP_NAME);
var $f99a8c78507165f7$export$a98f0dcb43a68a25 = /* @__PURE__ */ (0, import_react19.forwardRef)((props, forwardedRef) => {
  const { __scopeRadioGroup, name, defaultValue, value: valueProp, required = false, disabled = false, orientation, dir, loop = true, onValueChange, ...groupProps } = props;
  const rovingFocusGroupScope = $f99a8c78507165f7$var$useRovingFocusGroupScope(__scopeRadioGroup);
  const direction = $f631663db3294ace$export$b39126d51d94e6f3(dir);
  const [value, setValue] = $71cd76cc60e0454e$export$6f32135080cb4c3({
    prop: valueProp,
    defaultProp: defaultValue,
    onChange: onValueChange
  });
  return /* @__PURE__ */ (0, import_react19.createElement)($f99a8c78507165f7$var$RadioGroupProvider, {
    scope: __scopeRadioGroup,
    name,
    required,
    disabled,
    value,
    onValueChange: setValue
  }, /* @__PURE__ */ (0, import_react19.createElement)($d7bdfb9eb0fdf311$export$be92b6f5f03c0fe9, _extends({
    asChild: true
  }, rovingFocusGroupScope, {
    orientation,
    dir: direction,
    loop
  }), /* @__PURE__ */ (0, import_react19.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.div, _extends({
    role: "radiogroup",
    "aria-required": required,
    "aria-orientation": orientation,
    "data-disabled": disabled ? "" : void 0,
    dir: direction
  }, groupProps, {
    ref: forwardedRef
  }))));
});
var $f99a8c78507165f7$var$ITEM_NAME = "RadioGroupItem";
var $f99a8c78507165f7$export$9f866c100ef519e4 = /* @__PURE__ */ (0, import_react19.forwardRef)((props, forwardedRef) => {
  const { __scopeRadioGroup, disabled, ...itemProps } = props;
  const context = $f99a8c78507165f7$var$useRadioGroupContext($f99a8c78507165f7$var$ITEM_NAME, __scopeRadioGroup);
  const isDisabled = context.disabled || disabled;
  const rovingFocusGroupScope = $f99a8c78507165f7$var$useRovingFocusGroupScope(__scopeRadioGroup);
  const radioScope = $f99a8c78507165f7$var$useRadioScope(__scopeRadioGroup);
  const ref = (0, import_react19.useRef)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(forwardedRef, ref);
  const checked = context.value === itemProps.value;
  const isArrowKeyPressedRef = (0, import_react19.useRef)(false);
  (0, import_react19.useEffect)(() => {
    const handleKeyDown = (event) => {
      if ($f99a8c78507165f7$var$ARROW_KEYS.includes(event.key))
        isArrowKeyPressedRef.current = true;
    };
    const handleKeyUp = () => isArrowKeyPressedRef.current = false;
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
  return /* @__PURE__ */ (0, import_react19.createElement)($d7bdfb9eb0fdf311$export$6d08773d2e66f8f2, _extends({
    asChild: true
  }, rovingFocusGroupScope, {
    focusable: !isDisabled,
    active: checked
  }), /* @__PURE__ */ (0, import_react19.createElement)($ce77a8961b41be9e$export$d7b12c4107be0d61, _extends({
    disabled: isDisabled,
    required: context.required,
    checked
  }, radioScope, itemProps, {
    name: context.name,
    ref: composedRefs,
    onCheck: () => context.onValueChange(itemProps.value),
    onKeyDown: $e42e1063c40fb3ef$export$b9ecd428b558ff10((event) => {
      if (event.key === "Enter")
        event.preventDefault();
    }),
    onFocus: $e42e1063c40fb3ef$export$b9ecd428b558ff10(itemProps.onFocus, () => {
      var _ref$current;
      if (isArrowKeyPressedRef.current)
        (_ref$current = ref.current) === null || _ref$current === void 0 || _ref$current.click();
    })
  })));
});
var $f99a8c78507165f7$export$5fb54c671a65c88 = /* @__PURE__ */ (0, import_react19.forwardRef)((props, forwardedRef) => {
  const { __scopeRadioGroup, ...indicatorProps } = props;
  const radioScope = $f99a8c78507165f7$var$useRadioScope(__scopeRadioGroup);
  return /* @__PURE__ */ (0, import_react19.createElement)($ce77a8961b41be9e$export$d35a9ffa9a04f9e7, _extends({}, radioScope, indicatorProps, {
    ref: forwardedRef
  }));
});
var $f99a8c78507165f7$export$be92b6f5f03c0fe9 = $f99a8c78507165f7$export$a98f0dcb43a68a25;
var $f99a8c78507165f7$export$6d08773d2e66f8f2 = $f99a8c78507165f7$export$9f866c100ef519e4;
var $f99a8c78507165f7$export$adb584737d712b70 = $f99a8c78507165f7$export$5fb54c671a65c88;

// app/components/ui/radio-group.tsx
var React = __toESM(require_react(), 1);
var import_jsx_dev_runtime4 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/radio-group.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/radio-group.tsx"
  );
  import.meta.hot.lastModified = "1708316645855.7178";
}
var RadioGroup = React.forwardRef(_c4 = ({
  className,
  ...props
}, ref) => {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)($f99a8c78507165f7$export$be92b6f5f03c0fe9, { className: cn("grid gap-2", className), ...props, ref }, void 0, false, {
    fileName: "app/components/ui/radio-group.tsx",
    lineNumber: 29,
    columnNumber: 10
  }, this);
});
_c23 = RadioGroup;
RadioGroup.displayName = $f99a8c78507165f7$export$be92b6f5f03c0fe9.displayName;
var RadioGroupItem = React.forwardRef(_c32 = ({
  className,
  ...props
}, ref) => {
  return /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)($f99a8c78507165f7$export$6d08773d2e66f8f2, { ref, className: cn("aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50", className), ...props, children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)($f99a8c78507165f7$export$adb584737d712b70, { className: "flex items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_dev_runtime4.jsxDEV)(Circle, { className: "h-2.5 w-2.5 fill-current text-current" }, void 0, false, {
    fileName: "app/components/ui/radio-group.tsx",
    lineNumber: 39,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "app/components/ui/radio-group.tsx",
    lineNumber: 38,
    columnNumber: 4
  }, this) }, void 0, false, {
    fileName: "app/components/ui/radio-group.tsx",
    lineNumber: 37,
    columnNumber: 10
  }, this);
});
_c42 = RadioGroupItem;
RadioGroupItem.displayName = $f99a8c78507165f7$export$6d08773d2e66f8f2.displayName;
var _c4;
var _c23;
var _c32;
var _c42;
$RefreshReg$(_c4, "RadioGroup$React.forwardRef");
$RefreshReg$(_c23, "RadioGroup");
$RefreshReg$(_c32, "RadioGroupItem$React.forwardRef");
$RefreshReg$(_c42, "RadioGroupItem");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-radio-group-2.tsx
var import_jsx_dev_runtime5 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-radio-group-2.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s4 = $RefreshSig$();
var _s22 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-radio-group-2.tsx"
  );
  import.meta.hot.lastModified = "1710441768133.622";
}
function BaseRadioGroup({
  value,
  label,
  labelInfo,
  hideLabel,
  name,
  options,
  className,
  onValueChange,
  ...props
}) {
  _s4();
  const fallbackId = (0, import_react20.useId)();
  const id = props.id ?? fallbackId;
  const {
    error
  } = useField(name);
  const errorId = error?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(import_jsx_dev_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("input", { type: "hidden", name, value }, value, false, {
      fileName: "app/components/forms/form-radio-group-2.tsx",
      lineNumber: 51,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("div", { className: cn("flex flex-col gap-1", className), children: [
      labelInfo ? /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("label", { htmlFor: id, children: /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("span", { className: "flex items-center gap-2", children: [
        label ?? startCase(name),
        " ",
        /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("p", { className: "max-w-[300px]", children: labelInfo }, void 0, false, {
          fileName: "app/components/forms/form-radio-group-2.tsx",
          lineNumber: 56,
          columnNumber: 23
        }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
          fileName: "app/components/forms/form-radio-group-2.tsx",
          lineNumber: 57,
          columnNumber: 9
        }, this) }, void 0, false, {
          fileName: "app/components/forms/form-radio-group-2.tsx",
          lineNumber: 56,
          columnNumber: 8
        }, this)
      ] }, void 0, true, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 54,
        columnNumber: 7
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 53,
        columnNumber: 18
      }, this) : hideLabel ? null : /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("label", { htmlFor: id, children: label ?? startCase(name) }, void 0, false, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 60,
        columnNumber: 36
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(RadioGroup, { ...props, onValueChange, defaultValue: value, children: options.map((option) => /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("div", { className: "flex items-center space-x-2", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(RadioGroupItem, { value: option.value, id: option.value }, void 0, false, {
          fileName: "app/components/forms/form-radio-group-2.tsx",
          lineNumber: 63,
          columnNumber: 8
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("label", { htmlFor: option.value, className: "flex w-full items-center gap-2 text-sm", children: [
          option.label,
          option.info ? /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)("p", { className: "max-w-[300px]", children: option.info }, void 0, false, {
            fileName: "app/components/forms/form-radio-group-2.tsx",
            lineNumber: 66,
            columnNumber: 39
          }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
            fileName: "app/components/forms/form-radio-group-2.tsx",
            lineNumber: 67,
            columnNumber: 11
          }, this) }, void 0, false, {
            fileName: "app/components/forms/form-radio-group-2.tsx",
            lineNumber: 66,
            columnNumber: 24
          }, this) : null
        ] }, void 0, true, {
          fileName: "app/components/forms/form-radio-group-2.tsx",
          lineNumber: 64,
          columnNumber: 8
        }, this)
      ] }, v4_default(), true, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 62,
        columnNumber: 29
      }, this)) }, void 0, false, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 61,
        columnNumber: 5
      }, this),
      errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(ErrorList, { id: errorId, errors: [error] }, void 0, false, {
        fileName: "app/components/forms/form-radio-group-2.tsx",
        lineNumber: 72,
        columnNumber: 16
      }, this) : null
    ] }, void 0, true, {
      fileName: "app/components/forms/form-radio-group-2.tsx",
      lineNumber: 52,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/forms/form-radio-group-2.tsx",
    lineNumber: 50,
    columnNumber: 10
  }, this);
}
_s4(BaseRadioGroup, "cCqKvX4p4PpTK6hKd8TS9n7/Iic=", false, function() {
  return [import_react20.useId, useField];
});
_c5 = BaseRadioGroup;
function FormRadioGroup(props) {
  _s22();
  const [value, setValue] = useControlField(props.name);
  return /* @__PURE__ */ (0, import_jsx_dev_runtime5.jsxDEV)(BaseRadioGroup, { ...props, onValueChange: setValue, value }, void 0, false, {
    fileName: "app/components/forms/form-radio-group-2.tsx",
    lineNumber: 83,
    columnNumber: 10
  }, this);
}
_s22(FormRadioGroup, "1GotPTLorevX94gGG9CAhc+iSto=", false, function() {
  return [useControlField];
});
_c24 = FormRadioGroup;
var _c5;
var _c24;
$RefreshReg$(_c5, "BaseRadioGroup");
$RefreshReg$(_c24, "FormRadioGroup");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-switch-2.tsx
var import_react22 = __toESM(require_react(), 1);

// node_modules/@radix-ui/react-switch/dist/index.mjs
var import_react21 = __toESM(require_react(), 1);
var $6be4966fd9bbc698$var$SWITCH_NAME = "Switch";
var [$6be4966fd9bbc698$var$createSwitchContext, $6be4966fd9bbc698$export$cf7f5f17f69cbd43] = $c512c27ab02ef895$export$50c7b4e9d9f19c1($6be4966fd9bbc698$var$SWITCH_NAME);
var [$6be4966fd9bbc698$var$SwitchProvider, $6be4966fd9bbc698$var$useSwitchContext] = $6be4966fd9bbc698$var$createSwitchContext($6be4966fd9bbc698$var$SWITCH_NAME);
var $6be4966fd9bbc698$export$b5d5cf8927ab7262 = /* @__PURE__ */ (0, import_react21.forwardRef)((props, forwardedRef) => {
  const { __scopeSwitch, name, checked: checkedProp, defaultChecked, required, disabled, value = "on", onCheckedChange, ...switchProps } = props;
  const [button, setButton] = (0, import_react21.useState)(null);
  const composedRefs = $6ed0406888f73fc4$export$c7b2cbe3552a0d05(
    forwardedRef,
    (node) => setButton(node)
  );
  const hasConsumerStoppedPropagationRef = (0, import_react21.useRef)(false);
  const isFormControl = button ? Boolean(button.closest("form")) : true;
  const [checked = false, setChecked] = $71cd76cc60e0454e$export$6f32135080cb4c3({
    prop: checkedProp,
    defaultProp: defaultChecked,
    onChange: onCheckedChange
  });
  return /* @__PURE__ */ (0, import_react21.createElement)($6be4966fd9bbc698$var$SwitchProvider, {
    scope: __scopeSwitch,
    checked,
    disabled
  }, /* @__PURE__ */ (0, import_react21.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.button, _extends({
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "aria-required": required,
    "data-state": $6be4966fd9bbc698$var$getState(checked),
    "data-disabled": disabled ? "" : void 0,
    disabled,
    value
  }, switchProps, {
    ref: composedRefs,
    onClick: $e42e1063c40fb3ef$export$b9ecd428b558ff10(props.onClick, (event) => {
      setChecked(
        (prevChecked) => !prevChecked
      );
      if (isFormControl) {
        hasConsumerStoppedPropagationRef.current = event.isPropagationStopped();
        if (!hasConsumerStoppedPropagationRef.current)
          event.stopPropagation();
      }
    })
  })), isFormControl && /* @__PURE__ */ (0, import_react21.createElement)($6be4966fd9bbc698$var$BubbleInput, {
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
var $6be4966fd9bbc698$var$THUMB_NAME = "SwitchThumb";
var $6be4966fd9bbc698$export$4d07bf653ea69106 = /* @__PURE__ */ (0, import_react21.forwardRef)((props, forwardedRef) => {
  const { __scopeSwitch, ...thumbProps } = props;
  const context = $6be4966fd9bbc698$var$useSwitchContext($6be4966fd9bbc698$var$THUMB_NAME, __scopeSwitch);
  return /* @__PURE__ */ (0, import_react21.createElement)($8927f6f2acc4f386$export$250ffa63cdc0d034.span, _extends({
    "data-state": $6be4966fd9bbc698$var$getState(context.checked),
    "data-disabled": context.disabled ? "" : void 0
  }, thumbProps, {
    ref: forwardedRef
  }));
});
var $6be4966fd9bbc698$var$BubbleInput = (props) => {
  const { control, checked, bubbles = true, ...inputProps } = props;
  const ref = (0, import_react21.useRef)(null);
  const prevChecked = $010c2913dbd2fe3d$export$5cae361ad82dce8b(checked);
  const controlSize = $db6c3485150b8e66$export$1ab7ae714698c4b8(control);
  (0, import_react21.useEffect)(() => {
    const input = ref.current;
    const inputProto = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(inputProto, "checked");
    const setChecked = descriptor.set;
    if (prevChecked !== checked && setChecked) {
      const event = new Event("click", {
        bubbles
      });
      setChecked.call(input, checked);
      input.dispatchEvent(event);
    }
  }, [
    prevChecked,
    checked,
    bubbles
  ]);
  return /* @__PURE__ */ (0, import_react21.createElement)("input", _extends({
    type: "checkbox",
    "aria-hidden": true,
    defaultChecked: checked
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
function $6be4966fd9bbc698$var$getState(checked) {
  return checked ? "checked" : "unchecked";
}
var $6be4966fd9bbc698$export$be92b6f5f03c0fe9 = $6be4966fd9bbc698$export$b5d5cf8927ab7262;
var $6be4966fd9bbc698$export$6521433ed15a34db = $6be4966fd9bbc698$export$4d07bf653ea69106;

// app/components/ui/switch.tsx
var React2 = __toESM(require_react(), 1);
var import_jsx_dev_runtime6 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/switch.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/switch.tsx"
  );
  import.meta.hot.lastModified = "1709846855253.985";
}
var Switch = React2.forwardRef(_c6 = ({
  className,
  thumbProps,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime6.jsxDEV)($6be4966fd9bbc698$export$be92b6f5f03c0fe9, { className: cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className), ...props, ref, children: /* @__PURE__ */ (0, import_jsx_dev_runtime6.jsxDEV)($6be4966fd9bbc698$export$6521433ed15a34db, { className: cn("pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0", thumbProps?.className) }, void 0, false, {
  fileName: "app/components/ui/switch.tsx",
  lineNumber: 29,
  columnNumber: 3
}, this) }, void 0, false, {
  fileName: "app/components/ui/switch.tsx",
  lineNumber: 28,
  columnNumber: 12
}, this));
_c25 = Switch;
Switch.displayName = $6be4966fd9bbc698$export$be92b6f5f03c0fe9.displayName;
var _c6;
var _c25;
$RefreshReg$(_c6, "Switch$React.forwardRef");
$RefreshReg$(_c25, "Switch");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/forms/form-switch-2.tsx
var import_jsx_dev_runtime7 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/forms/form-switch-2.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s5 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/forms/form-switch-2.tsx"
  );
  import.meta.hot.lastModified = "1710533217630.7776";
}
function FormSwitch({
  label,
  labelInfo,
  name,
  hideLabel,
  ...props
}) {
  _s5();
  const fallbackId = (0, import_react22.useId)();
  const id = props.id ?? fallbackId;
  const {
    error,
    getInputProps
  } = useField(name);
  const errorId = error?.length ? `${id}-error` : void 0;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)("div", { className: cn("flex items-center gap-1"), children: [
    labelInfo ? /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)("label", { htmlFor: id, children: /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)("span", { className: "flex items-center gap-2", children: [
      label ?? startCase(name),
      " ",
      /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)(Tooltip, { text: /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)("p", { className: "max-w-[300px]", children: labelInfo }, void 0, false, {
        fileName: "app/components/forms/form-switch-2.tsx",
        lineNumber: 49,
        columnNumber: 22
      }, this), children: /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)(InfoCircledIcon, {}, void 0, false, {
        fileName: "app/components/forms/form-switch-2.tsx",
        lineNumber: 50,
        columnNumber: 8
      }, this) }, void 0, false, {
        fileName: "app/components/forms/form-switch-2.tsx",
        lineNumber: 49,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/forms/form-switch-2.tsx",
      lineNumber: 47,
      columnNumber: 6
    }, this) }, void 0, false, {
      fileName: "app/components/forms/form-switch-2.tsx",
      lineNumber: 46,
      columnNumber: 17
    }, this) : hideLabel ? null : /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)("label", { htmlFor: id, children: label ?? startCase(name) }, void 0, false, {
      fileName: "app/components/forms/form-switch-2.tsx",
      lineNumber: 53,
      columnNumber: 35
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)(Switch, { ...getInputProps({
      id,
      ...props
    }) }, void 0, false, {
      fileName: "app/components/forms/form-switch-2.tsx",
      lineNumber: 54,
      columnNumber: 4
    }, this),
    errorId ? /* @__PURE__ */ (0, import_jsx_dev_runtime7.jsxDEV)(ErrorList, { id: errorId, errors: [error] }, void 0, false, {
      fileName: "app/components/forms/form-switch-2.tsx",
      lineNumber: 58,
      columnNumber: 15
    }, this) : null
  ] }, void 0, true, {
    fileName: "app/components/forms/form-switch-2.tsx",
    lineNumber: 45,
    columnNumber: 10
  }, this);
}
_s5(FormSwitch, "QOHspPdh8P3Uiiuh8BB+NkygXIg=", false, function() {
  return [import_react22.useId, useField];
});
_c7 = FormSwitch;
var _c7;
$RefreshReg$(_c7, "FormSwitch");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/components/ui/sheet.tsx
var React4 = __toESM(require_react(), 1);
var import_jsx_dev_runtime8 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/components/ui/sheet.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/components/ui/sheet.tsx"
  );
  import.meta.hot.lastModified = "1710441598468.7305";
}
var Sheet = $5d3850c4d0b4e6c7$export$be92b6f5f03c0fe9;
var SheetTrigger = $5d3850c4d0b4e6c7$export$41fb9f06171c75f4;
var SheetPortal = $5d3850c4d0b4e6c7$export$602eac185826482c;
var SheetOverlay = React4.forwardRef(_c8 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)($5d3850c4d0b4e6c7$export$c6fdb837b070b4ff, { className: cn("fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className), ...props, ref }, void 0, false, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 33,
  columnNumber: 12
}, this));
_c26 = SheetOverlay;
SheetOverlay.displayName = $5d3850c4d0b4e6c7$export$c6fdb837b070b4ff.displayName;
var sheetVariants = cva("fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500", {
  variants: {
    side: {
      top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
      bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
      left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
      right: "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
    }
  },
  defaultVariants: {
    side: "right"
  }
});
var SheetContent = React4.forwardRef(_c33 = ({
  side = "right",
  className,
  children,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)(SheetPortal, { children: [
  /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)(SheetOverlay, {}, void 0, false, {
    fileName: "app/components/ui/sheet.tsx",
    lineNumber: 55,
    columnNumber: 3
  }, this),
  /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)($5d3850c4d0b4e6c7$export$7c6e2c02157bb7d2, { ref, className: cn(sheetVariants({
    side
  }), className), ...props, children: [
    children,
    /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)($5d3850c4d0b4e6c7$export$f39c2d165cd861fe, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)(X, { className: "h-4 w-4" }, void 0, false, {
        fileName: "app/components/ui/sheet.tsx",
        lineNumber: 61,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)("span", { className: "sr-only", children: "Close" }, void 0, false, {
        fileName: "app/components/ui/sheet.tsx",
        lineNumber: 62,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/components/ui/sheet.tsx",
      lineNumber: 60,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/components/ui/sheet.tsx",
    lineNumber: 56,
    columnNumber: 3
  }, this)
] }, void 0, true, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 54,
  columnNumber: 12
}, this));
_c43 = SheetContent;
SheetContent.displayName = $5d3850c4d0b4e6c7$export$7c6e2c02157bb7d2.displayName;
var SheetHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)("div", { className: cn("flex flex-col space-y-2 text-center sm:text-left", className), ...props }, void 0, false, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 71,
  columnNumber: 7
}, this);
_c52 = SheetHeader;
SheetHeader.displayName = "SheetHeader";
var SheetFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)("div", { className: cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className), ...props }, void 0, false, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 77,
  columnNumber: 7
}, this);
_c62 = SheetFooter;
SheetFooter.displayName = "SheetFooter";
var SheetTitle = React4.forwardRef(_c72 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)($5d3850c4d0b4e6c7$export$f99233281efd08a0, { ref, className: cn("text-lg font-semibold text-foreground", className), ...props }, void 0, false, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 83,
  columnNumber: 12
}, this));
_c82 = SheetTitle;
SheetTitle.displayName = $5d3850c4d0b4e6c7$export$f99233281efd08a0.displayName;
var SheetDescription = React4.forwardRef(_c9 = ({
  className,
  ...props
}, ref) => /* @__PURE__ */ (0, import_jsx_dev_runtime8.jsxDEV)($5d3850c4d0b4e6c7$export$393edc798c47379d, { ref, className: cn("text-sm text-muted-foreground", className), ...props }, void 0, false, {
  fileName: "app/components/ui/sheet.tsx",
  lineNumber: 89,
  columnNumber: 12
}, this));
_c10 = SheetDescription;
SheetDescription.displayName = $5d3850c4d0b4e6c7$export$393edc798c47379d.displayName;
var _c8;
var _c26;
var _c33;
var _c43;
var _c52;
var _c62;
var _c72;
var _c82;
var _c9;
var _c10;
$RefreshReg$(_c8, "SheetOverlay$React.forwardRef");
$RefreshReg$(_c26, "SheetOverlay");
$RefreshReg$(_c33, "SheetContent$React.forwardRef");
$RefreshReg$(_c43, "SheetContent");
$RefreshReg$(_c52, "SheetHeader");
$RefreshReg$(_c62, "SheetFooter");
$RefreshReg$(_c72, "SheetTitle$React.forwardRef");
$RefreshReg$(_c82, "SheetTitle");
$RefreshReg$(_c9, "SheetDescription$React.forwardRef");
$RefreshReg$(_c10, "SheetDescription");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/hooks/usePrevious.ts
var import_react23 = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/usePrevious.ts"
  );
  import.meta.hot.lastModified = "1708316645856.3743";
}
function usePrevious(value) {
  const ref = (0, import_react23.useRef)();
  (0, import_react23.useEffect)(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// app/routes/app.settings.modules.new/form-instruction.tsx
var import_jsx_dev_runtime9 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.modules.new/form-instruction.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s6 = $RefreshSig$();
var _s23 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.modules.new/form-instruction.tsx"
  );
  import.meta.hot.lastModified = "1710534302198.6892";
}
var InstructionSchema = z.object({
  title: z.string(),
  answerKey: z.string().nullable().optional(),
  answerType: z.string(),
  answerTypeOptions: z.string().nullable().optional(),
  prompt: z.string(),
  promptType: z.string(),
  position: helpers_exports.numeric(z.number().min(0)).optional(),
  canAskQuestion: z.union([z.literal("true").transform(() => true), z.literal("false").transform(() => false)])
});
var useOriginalValue = ({
  isOpen,
  value
}) => {
  _s6();
  const [original, setOriginal] = (0, import_react24.useState)();
  const wasOpen = usePrevious(isOpen);
  (0, import_react24.useEffect)(() => {
    if (isOpen && !wasOpen) {
      setOriginal(value);
    }
  }, [value, wasOpen, isOpen]);
  return original;
};
_s6(useOriginalValue, "/nkrQ26fmHCsI7pzSXcdOw+VGqw=", false, function() {
  return [usePrevious];
});
function FormInstruction({
  index,
  onDelete
}) {
  _s23();
  const [value, setValue] = useControlField(`instructions[${index}]`);
  const [isOpen, setIsOpen] = (0, import_react24.useState)(false);
  const originalValue = useOriginalValue({
    isOpen,
    value
  });
  if (!value)
    return null;
  return /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(import_jsx_dev_runtime9.Fragment, { children: [
    ["title", "answerKey", "answerType", "answerTypeOptions", "prompt", "promptType", "canAskQuestion"].map((key, i2) => /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(
      "input",
      {
        type: "hidden",
        name: `instructions[${index}].${key}`,
        value: value[key]
      },
      i2.toString(),
      false,
      {
        fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
        lineNumber: 79,
        columnNumber: 121
      },
      this
    )),
    /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Sheet, { open: isOpen, onOpenChange: () => setIsOpen(!isOpen), children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(SheetTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("div", { className: "flex w-full cursor-pointer items-center justify-between rounded-lg border p-1 pl-3 pr-1 hover:bg-foreground/[2%]", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("span", { children: value.title }, void 0, false, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 85,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(DropdownMenu, { children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(DropdownMenuTrigger, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Button, { variant: "ghost", size: "icon-sm", onClick: (e) => e.preventDefault(), children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(DotsVerticalIcon, {}, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 89,
            columnNumber: 10
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 88,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 87,
            columnNumber: 8
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(DropdownMenuContent, { children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(DropdownMenuItem, { onClick: onDelete, className: "cursor-pointer", children: "Delete" }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 93,
            columnNumber: 9
          }, this) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 92,
            columnNumber: 8
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 86,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
        lineNumber: 84,
        columnNumber: 6
      }, this) }, void 0, false, {
        fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
        lineNumber: 83,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(SheetContent, { className: "sm:max-w-screen flex w-screen flex-col rounded-l-xl px-4 py-5 sm:w-[600px]", children: [
        /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(SheetHeader, { className: "px-1", children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(SheetTitle, { children: "Instruction" }, void 0, false, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 102,
          columnNumber: 7
        }, this) }, void 0, false, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 101,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("div", { className: "flex flex-grow flex-col gap-4 overflow-scroll px-1", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormInput, { label: "Title", name: `instructions[${index}].title`, placeholder: "Title", value: value.title, onChange: (e) => setValue({
            ...value,
            title: e.target.value
          }) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 105,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormRadioGroup, { options: [{
            value: "hardcoded",
            label: "Hardcoded",
            info: "The prompt below will be given to the student word-for-word."
          }, {
            value: "ai",
            label: "AI",
            info: "The prompt below will be sent to GPT-4. That response will be given to the student."
          }], className: "gap-1", label: "Prompt type", name: `instructions[${index}].promptType` }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 109,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormTextarea, { label: "Prompt", name: `instructions[${index}].prompt`, placeholder: "Welcome student! Begin by introducing yourself.", labelInfo: "Depending on the above selection, this will either be sent to the student word-for-word, or this text will first be sent to GPT-4 and then given to the student.", value: value.prompt, onChange: (e) => setValue({
            ...value,
            prompt: e.target.value
          }) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 118,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormRadioGroup, { options: [{
            value: "textarea",
            label: "Text Area"
          }, {
            value: "select",
            label: "Select"
          }], className: "gap-1", label: "Answer type", name: `instructions[${index}].answerType` }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 122,
            columnNumber: 7
          }, this),
          value.answerType === "select" ? /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormInput, { label: "Answer options", name: `instructions[${index}].answerTypeOptions`, placeholder: "I'm done, I need help, Give a hint", value: value.answerTypeOptions ?? "", onChange: (e) => setValue({
            ...value,
            answerTypeOptions: e.target.value
          }) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 129,
            columnNumber: 40
          }, this) : null,
          value.answerType === "select" ? /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormSwitch, { label: "Can ask a question?", name: `instructions[${index}].canAskQuestion`, checked: value.canAskQuestion, onCheckedChange: (canAskQuestion) => setValue({
            ...value,
            canAskQuestion
          }) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 133,
            columnNumber: 40
          }, this) : null,
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(FormTextarea, { subLabel: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("p", { className: "flex flex-wrap gap-1 text-sm text-muted-foreground", children: [
            "Use variables to reference specific values. Options:",
            /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("code", { className: "text-xs", children: `user_content` }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 140,
                columnNumber: 11
              }, this),
              " ",
              /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Tooltip, { text: "Document text", children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(InfoCircledIcon, { className: "h-3.5 w-3.5" }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 142,
                columnNumber: 12
              }, this) }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 141,
                columnNumber: 11
              }, this)
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
              lineNumber: 139,
              columnNumber: 10
            }, this),
            /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("span", { className: "mt-0.5 flex items-center gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)("code", { className: "text-xs", children: `user_input` }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 146,
                columnNumber: 11
              }, this),
              " ",
              /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Tooltip, { text: "User input from text area or select options", children: /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(InfoCircledIcon, { className: "h-3.5 w-3.5" }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 148,
                columnNumber: 12
              }, this) }, void 0, false, {
                fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
                lineNumber: 147,
                columnNumber: 11
              }, this)
            ] }, void 0, true, {
              fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
              lineNumber: 145,
              columnNumber: 10
            }, this)
          ] }, void 0, true, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 137,
            columnNumber: 31
          }, this), placeholder: `I.e. "the content should be 3 sentences or more"`, name: `instructions[${index}].answerKey`, label: "Answer key", labelInfo: "Describe the end goal of this instruction. This content will be checked by GPT-4 to consider whether or not a student has successfully completed the instruction", value: value.answerKey ?? "", onChange: (e) => setValue({
            ...value,
            answerKey: e.target.value
          }) }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 137,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 104,
          columnNumber: 6
        }, this),
        /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(SheetFooter, { className: "mb-4 px-1 sm:mb-0", children: [
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Button, { onClick: (e) => {
            e.preventDefault();
            setIsOpen(false);
          }, children: "Save" }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 157,
            columnNumber: 7
          }, this),
          /* @__PURE__ */ (0, import_jsx_dev_runtime9.jsxDEV)(Button, { variant: "outline", onClick: (e) => {
            e.preventDefault();
            setIsOpen(false);
            if (originalValue)
              setValue(originalValue);
          }, children: "Cancel" }, void 0, false, {
            fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
            lineNumber: 163,
            columnNumber: 7
          }, this)
        ] }, void 0, true, {
          fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
          lineNumber: 156,
          columnNumber: 6
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
        lineNumber: 100,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
      lineNumber: 82,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.modules.new/form-instruction.tsx",
    lineNumber: 76,
    columnNumber: 10
  }, this);
}
_s23(FormInstruction, "Rt1nWgAoWhIcRL0DhTt+AfwK6UA=", false, function() {
  return [useControlField, useOriginalValue];
});
_c11 = FormInstruction;
var _c11;
$RefreshReg$(_c11, "FormInstruction");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

// app/routes/app.settings.modules.new/form.tsx
var import_jsx_dev_runtime10 = __toESM(require_jsx_dev_runtime(), 1);
if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
  console.warn("remix:hmr: React Fast Refresh only works when the Remix compiler is running in development mode.");
} else {
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = (type, id) => {
    window.$RefreshRuntime$.register(type, '"app/routes/app.settings.modules.new/form.tsx"' + id);
  };
  window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
}
var prevRefreshReg;
var prevRefreshSig;
var _s7 = $RefreshSig$();
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/routes/app.settings.modules.new/form.tsx"
  );
  import.meta.hot.lastModified = "1710443889694.3362";
}
var Schema = z.object({
  title: z.string(),
  tutorId: z.string().nullable(),
  position: helpers_exports.numeric(z.number().min(0)),
  description: z.string().nullable(),
  instructions: z.array(InstructionSchema).optional()
});
var validator = withZod(Schema);
var ModuleForm = ({
  defaultValues,
  tutors,
  formId
}) => {
  _s7();
  const {
    error
  } = useField("instructions", {
    formId
  });
  const [instructions, {
    push,
    remove: remove2
  }] = useFieldArray("instructions", {
    formId
  });
  return /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(ValidatedForm, { id: formId, validator, defaultValues, method: "POST", className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("div", { className: "flex gap-4", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(FormInput, { name: "title", placeholder: "Title", className: "flex-grow" }, void 0, false, {
        fileName: "app/routes/app.settings.modules.new/form.tsx",
        lineNumber: 58,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(FormInput, { name: "position", type: "number", placeholder: "1", min: 0, labelInfo: "Determines the order in which this module falls in relation to all the others." }, void 0, false, {
        fileName: "app/routes/app.settings.modules.new/form.tsx",
        lineNumber: 59,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.modules.new/form.tsx",
      lineNumber: 57,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(FormTextarea, { name: "description", placeholder: "Description" }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/form.tsx",
      lineNumber: 61,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(FormSearchSelect, { name: "tutorId", options: tutors.map((t2) => ({
      value: t2.id,
      label: t2.name
    })), label: "Tutor" }, void 0, false, {
      fileName: "app/routes/app.settings.modules.new/form.tsx",
      lineNumber: 62,
      columnNumber: 4
    }, this),
    /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("div", { className: "flex flex-col gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("label", { children: "Instructions" }, void 0, false, {
        fileName: "app/routes/app.settings.modules.new/form.tsx",
        lineNumber: 67,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("p", { className: "text-sm text-muted-foreground", children: "Instructions are the building block of a module. Instructions are presented sequentially to the student in order to perform a specified task." }, void 0, false, {
        fileName: "app/routes/app.settings.modules.new/form.tsx",
        lineNumber: 68,
        columnNumber: 5
      }, this),
      /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("div", { className: "flex flex-col gap-1", children: [
        instructions.map(({
          key
        }, i2) => /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(FormInstruction, { onDelete: () => remove2(i2), index: i2 }, key, false, {
          fileName: "app/routes/app.settings.modules.new/form.tsx",
          lineNumber: 76,
          columnNumber: 18
        }, this)),
        /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)(Button, { variant: "outline", onClick: (e) => {
          e.preventDefault();
          push({
            answerKey: "",
            answerType: "textarea",
            answerTypeOptions: "",
            prompt: "",
            promptType: "hardcoded",
            position: instructions.length,
            canAskQuestion: false,
            title: "New instruction"
          });
        }, children: "Add instruction" }, void 0, false, {
          fileName: "app/routes/app.settings.modules.new/form.tsx",
          lineNumber: 77,
          columnNumber: 6
        }, this),
        error && /* @__PURE__ */ (0, import_jsx_dev_runtime10.jsxDEV)("p", { className: "text-destructive-foreground", children: error }, void 0, false, {
          fileName: "app/routes/app.settings.modules.new/form.tsx",
          lineNumber: 92,
          columnNumber: 16
        }, this)
      ] }, void 0, true, {
        fileName: "app/routes/app.settings.modules.new/form.tsx",
        lineNumber: 73,
        columnNumber: 5
      }, this)
    ] }, void 0, true, {
      fileName: "app/routes/app.settings.modules.new/form.tsx",
      lineNumber: 66,
      columnNumber: 4
    }, this)
  ] }, void 0, true, {
    fileName: "app/routes/app.settings.modules.new/form.tsx",
    lineNumber: 56,
    columnNumber: 10
  }, this);
};
_s7(ModuleForm, "TKlG3gxdxkAgU8qnGejafhdWvJY=", false, function() {
  return [useField, useFieldArray];
});
_c12 = ModuleForm;
var _c12;
$RefreshReg$(_c12, "ModuleForm");
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;

export {
  ValidatedForm,
  useFormContext,
  withZod,
  ModuleForm
};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
//# sourceMappingURL=/build/_shared/chunk-TZTFE7HS.js.map
