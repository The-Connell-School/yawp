import {
  require_jsx_runtime
} from "/build/_shared/chunk-NMZL6IDN.js";
import {
  ZodAny,
  ZodArray,
  ZodBigInt,
  ZodBoolean,
  ZodCatch,
  ZodDate,
  ZodDefault,
  ZodDiscriminatedUnion,
  ZodEffects,
  ZodEnum,
  ZodIntersection,
  ZodLazy,
  ZodLiteral,
  ZodNativeEnum,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodPipeline,
  ZodString,
  ZodTuple,
  ZodUnion,
  anyType,
  lazyType
} from "/build/_shared/chunk-3FJOVXYZ.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// node_modules/@conform-to/react/_virtual/_rollupPluginBabelHelpers.mjs
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _defineProperty(obj, key, value) {
  key = _toPropertyKey(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null)
    return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;
  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0)
      continue;
    target[key] = source[key];
  }
  return target;
}
function _objectWithoutProperties(source, excluded) {
  if (source == null)
    return {};
  var target = _objectWithoutPropertiesLoose(source, excluded);
  var key, i;
  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0)
        continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key))
        continue;
      target[key] = source[key];
    }
  }
  return target;
}
function _toPrimitive(input, hint) {
  if (typeof input !== "object" || input === null)
    return input;
  var prim = input[Symbol.toPrimitive];
  if (prim !== void 0) {
    var res = prim.call(input, hint || "default");
    if (typeof res !== "object")
      return res;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (hint === "string" ? String : Number)(input);
}
function _toPropertyKey(arg) {
  var key = _toPrimitive(arg, "string");
  return typeof key === "symbol" ? key : String(key);
}

// node_modules/@conform-to/react/hooks.mjs
var import_react2 = __toESM(require_react(), 1);

// node_modules/@conform-to/dom/_virtual/_rollupPluginBabelHelpers.mjs
function ownKeys2(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread22(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys2(Object(t), true).forEach(function(r2) {
      _defineProperty2(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _defineProperty2(obj, key, value) {
  key = _toPropertyKey2(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _toPrimitive2(input, hint) {
  if (typeof input !== "object" || input === null)
    return input;
  var prim = input[Symbol.toPrimitive];
  if (prim !== void 0) {
    var res = prim.call(input, hint || "default");
    if (typeof res !== "object")
      return res;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (hint === "string" ? String : Number)(input);
}
function _toPropertyKey2(arg) {
  var key = _toPrimitive2(arg, "string");
  return typeof key === "symbol" ? key : String(key);
}

// node_modules/@conform-to/dom/formdata.mjs
function getFormData(form, submitter) {
  var payload = new FormData(form, submitter);
  if (submitter && submitter.type === "submit" && submitter.name !== "") {
    var entries = payload.getAll(submitter.name);
    if (!entries.includes(submitter.value)) {
      payload.append(submitter.name, submitter.value);
    }
  }
  return payload;
}
function getPaths(name) {
  if (!name) {
    return [];
  }
  return name.split(/\.|(\[\d*\])/).reduce((result, segment) => {
    if (typeof segment !== "undefined" && segment !== "") {
      if (segment.startsWith("[") && segment.endsWith("]")) {
        var index = segment.slice(1, -1);
        result.push(Number(index));
      } else {
        result.push(segment);
      }
    }
    return result;
  }, []);
}
function formatPaths(paths) {
  return paths.reduce((name, path) => {
    if (typeof path === "number") {
      return "".concat(name, "[").concat(Number.isNaN(path) ? "" : path, "]");
    }
    if (name === "" || path === "") {
      return [name, path].join("");
    }
    return [name, path].join(".");
  }, "");
}
function isPrefix(name, prefix) {
  var paths = getPaths(name);
  var prefixPaths = getPaths(prefix);
  return paths.length >= prefixPaths.length && prefixPaths.every((path, index) => paths[index] === path);
}
function setValue(target, name, valueFn) {
  var paths = getPaths(name);
  var length = paths.length;
  var lastIndex = length - 1;
  var index = -1;
  var pointer = target;
  while (pointer != null && ++index < length) {
    var _pointer$key;
    var key = paths[index];
    var nextKey = paths[index + 1];
    var newValue = index != lastIndex ? (_pointer$key = pointer[key]) !== null && _pointer$key !== void 0 ? _pointer$key : typeof nextKey === "number" ? [] : {} : valueFn(pointer[key]);
    pointer[key] = newValue;
    pointer = pointer[key];
  }
}
function getValue(target, name) {
  var pointer = target;
  for (var path of getPaths(name)) {
    if (typeof pointer === "undefined" || pointer == null) {
      break;
    }
    if (isPlainObject(pointer) && typeof path === "string") {
      pointer = pointer[path];
    } else if (Array.isArray(pointer) && typeof path === "number") {
      pointer = pointer[path];
    } else {
      return;
    }
  }
  return pointer;
}
function isPlainObject(obj) {
  return !!obj && obj.constructor === Object && Object.getPrototypeOf(obj) === Object.prototype;
}
function isFile(obj) {
  if (typeof File === "undefined") {
    return false;
  }
  return obj instanceof File;
}
function normalize(value) {
  if (isPlainObject(value)) {
    var obj = Object.keys(value).sort().reduce((result, key) => {
      var data = normalize(value[key]);
      if (typeof data !== "undefined") {
        result[key] = data;
      }
      return result;
    }, {});
    if (Object.keys(obj).length === 0) {
      return;
    }
    return obj;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return void 0;
    }
    return value.map(normalize);
  }
  if (typeof value === "string" && value === "" || value === null || isFile(value)) {
    return;
  }
  return value;
}
function flatten(data, options) {
  var _options$resolve;
  var result = {};
  var resolve = (_options$resolve = options === null || options === void 0 ? void 0 : options.resolve) !== null && _options$resolve !== void 0 ? _options$resolve : (data2) => data2;
  function setResult(data2, name) {
    var value = normalize(resolve(data2));
    if (typeof value !== "undefined") {
      result[name] = value;
    }
  }
  function processObject(obj, prefix2) {
    setResult(obj, prefix2);
    for (var [key, _value] of Object.entries(obj)) {
      var name = prefix2 ? "".concat(prefix2, ".").concat(key) : key;
      if (Array.isArray(_value)) {
        processArray(_value, name);
      } else if (_value && isPlainObject(_value)) {
        processObject(_value, name);
      } else {
        setResult(_value, name);
      }
    }
  }
  function processArray(array, prefix2) {
    setResult(array, prefix2);
    for (var i = 0; i < array.length; i++) {
      var item = array[i];
      var name = "".concat(prefix2, "[").concat(i, "]");
      if (Array.isArray(item)) {
        processArray(item, name);
      } else if (item && isPlainObject(item)) {
        processObject(item, name);
      } else {
        setResult(item, name);
      }
    }
  }
  if (data) {
    var _options$prefix;
    var prefix = (_options$prefix = options === null || options === void 0 ? void 0 : options.prefix) !== null && _options$prefix !== void 0 ? _options$prefix : "";
    if (Array.isArray(data)) {
      processArray(data, prefix);
    } else {
      processObject(data, prefix);
    }
  }
  return result;
}

// node_modules/@conform-to/dom/util.mjs
function invariant(expectedCondition, message) {
  if (!expectedCondition) {
    throw new Error(message);
  }
}
function generateId() {
  return (Date.now() * Math.random()).toString(36);
}
function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

// node_modules/@conform-to/dom/dom.mjs
function isFormControl(element) {
  return element instanceof Element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA" || element.tagName === "BUTTON");
}
function isFieldElement(element) {
  return isFormControl(element) && element.type !== "submit" && element.type !== "button" && element.type !== "reset";
}
function getFormAction(event) {
  var _ref, _submitter$getAttribu;
  var form = event.target;
  var submitter = event.submitter;
  return (_ref = (_submitter$getAttribu = submitter === null || submitter === void 0 ? void 0 : submitter.getAttribute("formaction")) !== null && _submitter$getAttribu !== void 0 ? _submitter$getAttribu : form.getAttribute("action")) !== null && _ref !== void 0 ? _ref : "".concat(location.pathname).concat(location.search);
}
function getFormEncType(event) {
  var _submitter$getAttribu2;
  var form = event.target;
  var submitter = event.submitter;
  var encType = (_submitter$getAttribu2 = submitter === null || submitter === void 0 ? void 0 : submitter.getAttribute("formenctype")) !== null && _submitter$getAttribu2 !== void 0 ? _submitter$getAttribu2 : form.enctype;
  if (encType === "multipart/form-data") {
    return encType;
  }
  return "application/x-www-form-urlencoded";
}
function getFormMethod(event) {
  var _ref2, _submitter$getAttribu3;
  var form = event.target;
  var submitter = event.submitter;
  var method = (_ref2 = (_submitter$getAttribu3 = submitter === null || submitter === void 0 ? void 0 : submitter.getAttribute("formmethod")) !== null && _submitter$getAttribu3 !== void 0 ? _submitter$getAttribu3 : form.getAttribute("method")) === null || _ref2 === void 0 ? void 0 : _ref2.toUpperCase();
  switch (method) {
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
      return method;
  }
  return "GET";
}
function requestSubmit(form, submitter) {
  invariant(!!form, "Failed to submit the form. The element provided is null or undefined.");
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit(submitter);
  } else {
    var event = new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter
    });
    form.dispatchEvent(event);
  }
}

// node_modules/@conform-to/dom/submission.mjs
var INTENT = "__intent__";
var STATE = "__state__";
function getSubmissionContext(body) {
  var intent = body.get(INTENT);
  var state = body.get(STATE);
  var payload = {};
  var fields = [];
  invariant((typeof intent === "string" || intent === null) && (typeof state === "string" || state === null), 'The input name "'.concat(INTENT, '" and "').concat(STATE, '" are reserved by Conform. Please use another name for your input.'));
  var _loop = function _loop2(next2) {
    if (name === INTENT || name === STATE) {
      return 1;
    }
    fields.push(name);
    setValue(payload, name, (prev) => {
      if (!prev) {
        return next2;
      } else if (Array.isArray(prev)) {
        return prev.concat(next2);
      } else {
        return [prev, next2];
      }
    });
  };
  for (var [name, next] of body.entries()) {
    if (_loop(next))
      continue;
  }
  return {
    payload,
    intent: getIntent(intent),
    state: state ? JSON.parse(state) : {
      validated: {}
    },
    fields
  };
}
function parse(payload, options) {
  var context = getSubmissionContext(payload);
  var intent = context.intent;
  if (intent) {
    switch (intent.type) {
      case "validate":
        if (intent.payload.name) {
          context.state.validated[intent.payload.name] = true;
        }
        break;
      case "update": {
        var {
          name,
          validated
        } = intent.payload;
        var _value = serialize(intent.payload.value);
        if (typeof _value !== "undefined") {
          if (name) {
            setValue(context.payload, name, () => _value);
          } else {
            context.payload = _value;
          }
        }
        if (typeof validated !== "undefined") {
          if (name) {
            setState(context.state.validated, name, () => void 0);
          } else {
            context.state.validated = {};
          }
          if (validated) {
            if (isPlainObject(_value) || Array.isArray(_value)) {
              Object.assign(context.state.validated, flatten(_value, {
                resolve() {
                  return true;
                },
                prefix: name
              }));
            }
            context.state.validated[name !== null && name !== void 0 ? name : ""] = true;
          } else if (name) {
            delete context.state.validated[name];
          }
        }
        break;
      }
      case "reset": {
        var {
          name: _name
        } = intent.payload;
        if (_name) {
          setValue(context.payload, _name, () => void 0);
          setState(context.state.validated, _name, () => void 0);
          delete context.state.validated[_name];
        } else {
          context.payload = {};
          context.state.validated = {};
        }
        break;
      }
      case "insert":
      case "remove":
      case "reorder": {
        setListValue(context.payload, intent);
        setListState(context.state.validated, intent);
        context.state.validated[intent.payload.name] = true;
        break;
      }
    }
  }
  var result = options.resolve(context.payload, intent);
  var mergeResolveResult = (resolved) => {
    var error = typeof resolved.error !== "undefined" ? resolved.error : {};
    if (!intent || intent.type === "validate" && !intent.payload.name) {
      for (var _name2 of [...context.fields, ...Object.keys(error !== null && error !== void 0 ? error : {})]) {
        context.state.validated[_name2] = true;
      }
    }
    return createSubmission(_objectSpread22(_objectSpread22({}, context), {}, {
      value: resolved.value,
      error: resolved.error
    }));
  };
  if (result instanceof Promise) {
    return result.then(mergeResolveResult);
  }
  return mergeResolveResult(result);
}
function createSubmission(context) {
  if (context.intent || !context.value || context.error) {
    return {
      status: !context.intent ? "error" : void 0,
      payload: context.payload,
      error: typeof context.error !== "undefined" ? context.error : {},
      reply(options) {
        return replySubmission(context, options);
      }
    };
  }
  return {
    status: "success",
    payload: context.payload,
    value: context.value,
    reply(options) {
      return replySubmission(context, options);
    }
  };
}
function replySubmission(context) {
  var _context$intent, _options$formErrors, _normalize;
  var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
  switch ((_context$intent = context.intent) === null || _context$intent === void 0 ? void 0 : _context$intent.type) {
    case "reset": {
      var _context$intent$paylo;
      var name = (_context$intent$paylo = context.intent.payload.name) !== null && _context$intent$paylo !== void 0 ? _context$intent$paylo : "";
      if (name === "") {
        return {
          initialValue: null
        };
      }
    }
  }
  if ("resetForm" in options && options.resetForm) {
    return {
      initialValue: null
    };
  }
  if ("hideFields" in options && options.hideFields) {
    for (var _name3 of options.hideFields) {
      var _value2 = getValue(context.payload, _name3);
      if (typeof _value2 !== "undefined") {
        setValue(context.payload, _name3, () => void 0);
      }
    }
  }
  var submissionError = context.error ? Object.entries(context.error).reduce((result, _ref) => {
    var [name2, error2] = _ref;
    if (context.state.validated[name2]) {
      result[name2] = error2;
    }
    return result;
  }, {}) : void 0;
  var extraError = "formErrors" in options || "fieldErrors" in options ? normalize(_objectSpread22({
    "": (_options$formErrors = options.formErrors) !== null && _options$formErrors !== void 0 ? _options$formErrors : null
  }, options.fieldErrors)) : null;
  var error = submissionError || extraError ? _objectSpread22(_objectSpread22({}, submissionError), extraError) : void 0;
  return {
    status: context.intent ? void 0 : error ? "error" : "success",
    intent: context.intent ? context.intent : void 0,
    initialValue: (_normalize = normalize(context.payload)) !== null && _normalize !== void 0 ? _normalize : {},
    error,
    state: context.state
  };
}
function getIntent(serializedIntent) {
  if (!serializedIntent) {
    return null;
  }
  var control = JSON.parse(serializedIntent);
  if (typeof control.type !== "string" || typeof control.payload === "undefined") {
    throw new Error("Unknown form control intent");
  }
  return control;
}
function serializeIntent(intent) {
  return JSON.stringify(intent);
}
function updateList(list, intent) {
  var _intent$payload$index;
  invariant(Array.isArray(list), "Failed to update list. The value is not an array.");
  switch (intent.type) {
    case "insert":
      list.splice((_intent$payload$index = intent.payload.index) !== null && _intent$payload$index !== void 0 ? _intent$payload$index : list.length, 0, serialize(intent.payload.defaultValue));
      break;
    case "remove":
      list.splice(intent.payload.index, 1);
      break;
    case "reorder":
      list.splice(intent.payload.to, 0, ...list.splice(intent.payload.from, 1));
      break;
    default:
      throw new Error("Unknown list intent received");
  }
}
function setListValue(data, intent) {
  setValue(data, intent.payload.name, (value) => {
    var list = value !== null && value !== void 0 ? value : [];
    updateList(list, intent);
    return list;
  });
}
function setState(state, name, valueFn) {
  var root = Symbol.for("root");
  var keys2 = Object.keys(state).sort((prev, next) => next.localeCompare(prev));
  var target = {};
  var _loop2 = function _loop22() {
    var value = state[key];
    if (isPrefix(key, name) && key !== name) {
      setValue(target, key, (currentValue) => {
        if (typeof currentValue === "undefined") {
          return value;
        }
        currentValue[root] = value;
        return currentValue;
      });
      delete state[key];
    }
  };
  for (var key of keys2) {
    _loop2();
  }
  var result = valueFn(getValue(target, name));
  Object.assign(
    state,
    // @ts-expect-error FIXME flatten should be more flexible
    flatten(result, {
      resolve(data) {
        if (isPlainObject(data) || Array.isArray(data)) {
          var _data$root;
          return (_data$root = data[root]) !== null && _data$root !== void 0 ? _data$root : null;
        }
        return data;
      },
      prefix: name
    })
  );
}
function setListState(state, intent, getDefaultValue) {
  setState(state, intent.payload.name, (value) => {
    var list = value !== null && value !== void 0 ? value : [];
    switch (intent.type) {
      case "insert":
        updateList(list, {
          type: intent.type,
          payload: _objectSpread22(_objectSpread22({}, intent.payload), {}, {
            defaultValue: getDefaultValue === null || getDefaultValue === void 0 ? void 0 : getDefaultValue()
          })
        });
        break;
      default:
        updateList(list, intent);
        break;
    }
    return list;
  });
}
function serialize(defaultValue) {
  if (isPlainObject(defaultValue)) {
    return Object.entries(defaultValue).reduce((result, _ref2) => {
      var [key, value] = _ref2;
      result[key] = serialize(value);
      return result;
    }, {});
  } else if (Array.isArray(defaultValue)) {
    return defaultValue.map(serialize);
  } else if (
    // @ts-ignore-error FIXME
    defaultValue instanceof Date
  ) {
    return defaultValue.toISOString();
  } else if (typeof defaultValue === "boolean") {
    return defaultValue ? "on" : void 0;
  } else if (typeof defaultValue === "number") {
    return defaultValue.toString();
  } else {
    return defaultValue !== null && defaultValue !== void 0 ? defaultValue : void 0;
  }
}

// node_modules/@conform-to/dom/form.mjs
function createFormMeta(options, initialized) {
  var _lastResult$initialVa, _options$constraint, _lastResult$state$val, _lastResult$state, _ref;
  var lastResult = !initialized ? options.lastResult : void 0;
  var defaultValue = options.defaultValue ? serialize(options.defaultValue) : {};
  var initialValue = (_lastResult$initialVa = lastResult === null || lastResult === void 0 ? void 0 : lastResult.initialValue) !== null && _lastResult$initialVa !== void 0 ? _lastResult$initialVa : defaultValue;
  var result = {
    submissionStatus: lastResult === null || lastResult === void 0 ? void 0 : lastResult.status,
    defaultValue,
    initialValue,
    value: initialValue,
    constraint: (_options$constraint = options.constraint) !== null && _options$constraint !== void 0 ? _options$constraint : {},
    validated: (_lastResult$state$val = lastResult === null || lastResult === void 0 || (_lastResult$state = lastResult.state) === null || _lastResult$state === void 0 ? void 0 : _lastResult$state.validated) !== null && _lastResult$state$val !== void 0 ? _lastResult$state$val : {},
    key: !initialized ? getDefaultKey(defaultValue) : _objectSpread22({
      "": generateId()
    }, getDefaultKey(defaultValue)),
    // The `lastResult` should comes from the server which we won't expect the error to be null
    // We can consider adding a warning if it happens
    error: (_ref = lastResult === null || lastResult === void 0 ? void 0 : lastResult.error) !== null && _ref !== void 0 ? _ref : {}
  };
  if (lastResult !== null && lastResult !== void 0 && lastResult.intent) {
    handleIntent(result, lastResult.intent);
  }
  return result;
}
function getDefaultKey(defaultValue, prefix) {
  return Object.entries(flatten(defaultValue, {
    prefix
  })).reduce((result, _ref2) => {
    var [key, value] = _ref2;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        result[formatPaths([...getPaths(key), i])] = generateId();
      }
    }
    return result;
  }, {});
}
function handleIntent(meta, intent, initialized) {
  switch (intent.type) {
    case "update": {
      if (typeof intent.payload.value !== "undefined") {
        var _intent$payload$name;
        var _name = (_intent$payload$name = intent.payload.name) !== null && _intent$payload$name !== void 0 ? _intent$payload$name : "";
        var value = serialize(intent.payload.value);
        updateValue(meta, _name, value);
      }
      break;
    }
    case "reset": {
      var _intent$payload$name2;
      var _name2 = (_intent$payload$name2 = intent.payload.name) !== null && _intent$payload$name2 !== void 0 ? _intent$payload$name2 : "";
      var _value = getValue(meta.defaultValue, _name2);
      updateValue(meta, _name2, _value);
      break;
    }
    case "insert":
    case "remove":
    case "reorder": {
      if (initialized) {
        meta.initialValue = clone(meta.initialValue);
        meta.key = clone(meta.key);
        setListState(meta.key, intent, generateId);
        setListValue(meta.initialValue, intent);
      }
      break;
    }
  }
}
function updateValue(meta, name, value) {
  meta.initialValue = clone(meta.initialValue);
  meta.value = clone(meta.value);
  meta.key = clone(meta.key);
  setValue(meta.initialValue, name, () => value);
  setValue(meta.value, name, () => value);
  if (isPlainObject(value) || Array.isArray(value)) {
    setState(meta.key, name, () => void 0);
    Object.assign(meta.key, getDefaultKey(value, name));
  }
  meta.key[name] = generateId();
}
function createStateProxy(fn) {
  var cache = {};
  return new Proxy(cache, {
    get(_, name, receiver) {
      var _cache$name;
      return (_cache$name = cache[name]) !== null && _cache$name !== void 0 ? _cache$name : cache[name] = fn(name, receiver);
    }
  });
}
function createValueProxy(value) {
  var val = normalize(value);
  return createStateProxy((name, proxy) => {
    if (name === "") {
      return val;
    }
    var paths = getPaths(name);
    var basename = formatPaths(paths.slice(0, -1));
    var key = formatPaths(paths.slice(-1));
    var parentValue = proxy[basename];
    return getValue(parentValue, key);
  });
}
function createConstraintProxy(constraint) {
  return createStateProxy((name, proxy) => {
    var _result;
    var result = constraint[name];
    if (!result) {
      var paths = getPaths(name);
      for (var i = paths.length - 1; i >= 0; i--) {
        var path = paths[i];
        if (typeof path === "number" && !Number.isNaN(path)) {
          paths[i] = Number.NaN;
          break;
        }
      }
      var alternative = formatPaths(paths);
      if (name !== alternative) {
        result = proxy[alternative];
      }
    }
    return (_result = result) !== null && _result !== void 0 ? _result : {};
  });
}
function createKeyProxy(key) {
  return createStateProxy((name, proxy) => {
    var currentKey = key[name];
    var paths = getPaths(name);
    if (paths.length === 0) {
      return currentKey;
    }
    var parentKey = proxy[formatPaths(paths.slice(0, -1))];
    if (typeof parentKey === "undefined") {
      return currentKey;
    }
    return "".concat(parentKey, "/").concat(currentKey !== null && currentKey !== void 0 ? currentKey : paths.at(-1));
  });
}
function createValidProxy(error) {
  return createStateProxy((name) => {
    var keys2 = Object.keys(error);
    if (name === "") {
      return keys2.length === 0;
    }
    for (var key of keys2) {
      if (isPrefix(key, name) && typeof error[key] !== "undefined") {
        return false;
      }
    }
    return true;
  });
}
function createDirtyProxy(defaultValue, value, shouldDirtyConsider) {
  return createStateProxy((name) => JSON.stringify(defaultValue[name]) !== JSON.stringify(value[name], (key, value2) => {
    if (name === "" && key === "" && value2) {
      return Object.entries(value2).reduce((result, _ref3) => {
        var [name2, value3] = _ref3;
        if (!shouldDirtyConsider(name2)) {
          return result;
        }
        return Object.assign(result !== null && result !== void 0 ? result : {}, {
          [name2]: value3
        });
      }, void 0);
    }
    return value2;
  }));
}
function shouldNotify(prev, next, cache, scope) {
  var compareFn = arguments.length > 4 && arguments[4] !== void 0 ? arguments[4] : (prev2, next2) => JSON.stringify(prev2) !== JSON.stringify(next2);
  if (scope && prev !== next) {
    var _scope$prefix, _scope$name;
    var prefixes = (_scope$prefix = scope.prefix) !== null && _scope$prefix !== void 0 ? _scope$prefix : [];
    var names = (_scope$name = scope.name) !== null && _scope$name !== void 0 ? _scope$name : [];
    var list = prefixes.length === 0 ? names : Array.from(/* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(next)]));
    var _loop = function _loop2(_name32) {
      if (prefixes.length === 0 || names.includes(_name32) || prefixes.some((prefix) => isPrefix(_name32, prefix))) {
        var _cache$_name;
        (_cache$_name = cache[_name32]) !== null && _cache$_name !== void 0 ? _cache$_name : cache[_name32] = compareFn(prev[_name32], next[_name32]);
        if (cache[_name32]) {
          return {
            v: true
          };
        }
      }
    }, _ret;
    for (var _name3 of list) {
      _ret = _loop(_name3);
      if (_ret)
        return _ret.v;
    }
  }
  return false;
}
function createFormContext(options) {
  var subscribers = [];
  var latestOptions = options;
  var meta = createFormMeta(options);
  var state = createFormState(meta);
  function getFormElement2() {
    return document.forms.namedItem(latestOptions.formId);
  }
  function createFormState(next) {
    var prev = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : next;
    var state2 = arguments.length > 2 ? arguments[2] : void 0;
    var defaultValue = !state2 || prev.defaultValue !== next.defaultValue ? createValueProxy(next.defaultValue) : state2.defaultValue;
    var initialValue = next.initialValue === next.defaultValue ? defaultValue : !state2 || prev.initialValue !== next.initialValue ? createValueProxy(next.initialValue) : state2.initialValue;
    var value = next.value === next.initialValue ? initialValue : !state2 || prev.value !== next.value ? createValueProxy(next.value) : state2.value;
    return {
      submissionStatus: next.submissionStatus,
      defaultValue,
      initialValue,
      value,
      error: !state2 || prev.error !== next.error ? next.error : state2.error,
      validated: next.validated,
      constraint: !state2 || prev.constraint !== next.constraint ? createConstraintProxy(next.constraint) : state2.constraint,
      key: !state2 || prev.key !== next.key ? createKeyProxy(next.key) : state2.key,
      valid: !state2 || prev.error !== next.error ? createValidProxy(next.error) : state2.valid,
      dirty: !state2 || prev.defaultValue !== next.defaultValue || prev.value !== next.value ? createDirtyProxy(defaultValue, value, (key) => {
        var _latestOptions$should, _latestOptions$should2;
        return (_latestOptions$should = (_latestOptions$should2 = latestOptions.shouldDirtyConsider) === null || _latestOptions$should2 === void 0 ? void 0 : _latestOptions$should2.call(latestOptions, key)) !== null && _latestOptions$should !== void 0 ? _latestOptions$should : true;
      }) : state2.dirty
    };
  }
  function updateFormMeta(nextMeta) {
    var prevMeta = meta;
    var prevState = state;
    var nextState = createFormState(nextMeta, prevMeta, prevState);
    meta = nextMeta;
    state = nextState;
    var cache = {
      value: {},
      error: {},
      initialValue: {},
      key: {},
      valid: {},
      dirty: {}
    };
    for (var subscriber of subscribers) {
      var _subscriber$getSubjec;
      var subject = (_subscriber$getSubjec = subscriber.getSubject) === null || _subscriber$getSubjec === void 0 ? void 0 : _subscriber$getSubjec.call(subscriber);
      if (!subject || subject.status && prevState.submissionStatus !== nextState.submissionStatus || shouldNotify(prevState.error, nextState.error, cache.error, subject.error) || shouldNotify(prevState.initialValue, nextState.initialValue, cache.initialValue, subject.initialValue) || shouldNotify(prevState.key, nextState.key, cache.key, subject.key, (prev, next) => prev !== next) || shouldNotify(prevState.valid, nextState.valid, cache.valid, subject.valid, compareBoolean) || shouldNotify(prevState.dirty, nextState.dirty, cache.dirty, subject.dirty, compareBoolean) || shouldNotify(prevState.value, nextState.value, cache.value, subject.value)) {
        subscriber.callback();
      }
    }
  }
  function compareBoolean() {
    var prev = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : false;
    var next = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : false;
    return prev !== next;
  }
  function getStateInput(form) {
    var element = form.elements.namedItem(STATE);
    invariant(element === null || isFieldElement(element), 'The input name "'.concat(STATE, '" is reserved by Conform. Please use another name.'));
    if (!element) {
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = STATE;
      input.value = "";
      form.append(input);
      return input;
    }
    return element;
  }
  function getSerializedState() {
    return JSON.stringify({
      validated: meta.validated
    });
  }
  function submit(event) {
    var form = event.target;
    var submitter = event.submitter;
    invariant(form === getFormElement2(), "The submit event is dispatched by form#".concat(form.id, " instead of form#").concat(latestOptions.formId));
    var input = getStateInput(form);
    input.value = getSerializedState();
    var formData = getFormData(form, submitter);
    var result = {
      formData,
      action: getFormAction(event),
      encType: getFormEncType(event),
      method: getFormMethod(event)
    };
    if (typeof (latestOptions === null || latestOptions === void 0 ? void 0 : latestOptions.onValidate) === "undefined") {
      return result;
    }
    var submission = latestOptions.onValidate({
      form,
      formData,
      submitter
    });
    if (submission.status !== "success" && submission.error !== null) {
      report(submission.reply());
    }
    return _objectSpread22(_objectSpread22({}, result), {}, {
      submission
    });
  }
  function resolveTarget(event) {
    var form = getFormElement2();
    var element = event.target;
    if (!form || !isFieldElement(element) || element.form !== form || element.name === "") {
      return null;
    }
    return element;
  }
  function willValidate(element, eventName) {
    var {
      shouldValidate = "onSubmit",
      shouldRevalidate = shouldValidate
    } = latestOptions;
    var validated = meta.validated[element.name];
    return validated ? shouldRevalidate === eventName : shouldValidate === eventName;
  }
  function onInput(event) {
    var element = resolveTarget(event);
    if (!element || !element.form) {
      return;
    }
    if (event.defaultPrevented || !willValidate(element, "onInput")) {
      var formData = new FormData(element.form);
      var result = getSubmissionContext(formData);
      updateFormMeta(_objectSpread22(_objectSpread22({}, meta), {}, {
        value: result.payload
      }));
    } else {
      dispatch({
        type: "validate",
        payload: {
          name: element.name
        }
      });
    }
  }
  function onBlur(event) {
    var element = resolveTarget(event);
    if (!element || event.defaultPrevented || !willValidate(element, "onBlur")) {
      return;
    }
    dispatch({
      type: "validate",
      payload: {
        name: element.name
      }
    });
  }
  function onReset(event) {
    var element = getFormElement2();
    if (event.type !== "reset" || event.target !== element || event.defaultPrevented) {
      return;
    }
    updateFormMeta(createFormMeta(latestOptions, true));
  }
  function report(result) {
    var _result$error, _result$state$validat, _result$state;
    var formElement = getFormElement2();
    if (!result.initialValue) {
      formElement === null || formElement === void 0 || formElement.reset();
      return;
    }
    var error = Object.entries((_result$error = result.error) !== null && _result$error !== void 0 ? _result$error : {}).reduce((result2, _ref4) => {
      var [name, newError] = _ref4;
      var error2 = newError === null ? meta.error[name] : newError;
      if (error2) {
        result2[name] = error2;
      }
      return result2;
    }, {});
    var update = _objectSpread22(_objectSpread22({}, meta), {}, {
      submissionStatus: result.status,
      value: result.initialValue,
      error,
      validated: (_result$state$validat = (_result$state = result.state) === null || _result$state === void 0 ? void 0 : _result$state.validated) !== null && _result$state$validat !== void 0 ? _result$state$validat : {}
    });
    if (result.intent) {
      handleIntent(update, result.intent, true);
    }
    updateFormMeta(update);
    if (formElement && result.status === "error") {
      for (var element of formElement.elements) {
        if (isFieldElement(element) && error[element.name]) {
          element.focus();
          break;
        }
      }
    }
  }
  function onUpdate(options2) {
    var currentFormId = latestOptions.formId;
    var currentResult = latestOptions.lastResult;
    Object.assign(latestOptions, options2);
    if (latestOptions.formId !== currentFormId) {
      var _getFormElement;
      (_getFormElement = getFormElement2()) === null || _getFormElement === void 0 || _getFormElement.reset();
    } else if (options2.lastResult && options2.lastResult !== currentResult) {
      report(options2.lastResult);
    }
  }
  function subscribe(callback, getSubject) {
    var subscriber = {
      callback,
      getSubject
    };
    subscribers.push(subscriber);
    return () => {
      subscribers = subscribers.filter((current) => current !== subscriber);
    };
  }
  function getState() {
    return state;
  }
  function dispatch(intent) {
    var form = getFormElement2();
    var submitter = document.createElement("button");
    var buttonProps = getControlButtonProps(intent);
    submitter.name = buttonProps.name;
    submitter.value = buttonProps.value;
    submitter.hidden = true;
    submitter.formNoValidate = true;
    form === null || form === void 0 || form.appendChild(submitter);
    requestSubmit(form, submitter);
    form === null || form === void 0 || form.removeChild(submitter);
  }
  function getControlButtonProps(intent) {
    return {
      name: INTENT,
      value: serializeIntent(intent),
      form: latestOptions.formId,
      formNoValidate: true
    };
  }
  function createFormControl(type) {
    var control = function control2() {
      var payload = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
      return dispatch({
        type,
        payload
      });
    };
    return Object.assign(control, {
      getButtonProps() {
        var payload = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        return getControlButtonProps({
          type,
          payload
        });
      }
    });
  }
  return {
    get formId() {
      return latestOptions.formId;
    },
    submit,
    onReset,
    onInput,
    onBlur,
    onUpdate,
    validate: createFormControl("validate"),
    reset: createFormControl("reset"),
    update: createFormControl("update"),
    insert: createFormControl("insert"),
    remove: createFormControl("remove"),
    reorder: createFormControl("reorder"),
    subscribe,
    getState,
    getSerializedState
  };
}

// node_modules/@conform-to/react/context.mjs
var import_react = __toESM(require_react(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var _excluded = ["onSubmit"];
var wrappedSymbol = Symbol("wrapped");
function useFormState(form, subjectRef) {
  var subscribe = (0, import_react.useCallback)((callback) => form.subscribe(callback, () => subjectRef === null || subjectRef === void 0 ? void 0 : subjectRef.current), [form, subjectRef]);
  return (0, import_react.useSyncExternalStore)(subscribe, form.getState, form.getState);
}
function useSubjectRef() {
  var initialSubject = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
  var subjectRef = (0, import_react.useRef)(initialSubject);
  subjectRef.current = initialSubject;
  return subjectRef;
}
function updateSubjectRef(ref, name, subject, scope) {
  if (subject === "status") {
    ref.current[subject] = true;
  } else {
    var _ref$current$subject$, _ref$current$subject;
    ref.current[subject] = _objectSpread2(_objectSpread2({}, ref.current[subject]), {}, {
      [scope]: ((_ref$current$subject$ = (_ref$current$subject = ref.current[subject]) === null || _ref$current$subject === void 0 ? void 0 : _ref$current$subject[scope]) !== null && _ref$current$subject$ !== void 0 ? _ref$current$subject$ : []).concat(name)
    });
  }
}
function getMetadata(formId, state, subjectRef) {
  var name = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : "";
  var id = name ? "".concat(formId, "-").concat(name) : formId;
  return new Proxy({
    id,
    name,
    errorId: "".concat(id, "-error"),
    descriptionId: "".concat(id, "-description"),
    get initialValue() {
      return state.initialValue[name];
    },
    get value() {
      return state.value[name];
    },
    get errors() {
      return state.error[name];
    },
    get key() {
      return state.key[name];
    },
    get valid() {
      return state.valid[name];
    },
    get dirty() {
      return state.dirty[name];
    },
    get allErrors() {
      if (name === "") {
        return state.error;
      }
      var result = {};
      for (var [key, error] of Object.entries(state.error)) {
        if (isPrefix(key, name)) {
          result[key] = error;
        }
      }
      return result;
    },
    get getFieldset() {
      return () => new Proxy({}, {
        get(target, key, receiver) {
          if (typeof key === "string") {
            return getFieldMetadata(formId, state, subjectRef, name, key);
          }
          return Reflect.get(target, key, receiver);
        }
      });
    }
  }, {
    get(target, key, receiver) {
      switch (key) {
        case "key":
        case "initialValue":
        case "value":
        case "valid":
        case "dirty":
          updateSubjectRef(subjectRef, name, key, "name");
          break;
        case "errors":
        case "allErrors":
          updateSubjectRef(subjectRef, name, "error", key === "errors" ? "name" : "prefix");
          break;
      }
      return Reflect.get(target, key, receiver);
    }
  });
}
function getFieldMetadata(formId, state, subjectRef) {
  var prefix = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : "";
  var key = arguments.length > 4 ? arguments[4] : void 0;
  var name = typeof key === "undefined" ? prefix : formatPaths([...getPaths(prefix), key]);
  var metadata = getMetadata(formId, state, subjectRef, name);
  return new Proxy({}, {
    get(_, key2, receiver) {
      var _state$constraint$nam;
      switch (key2) {
        case "formId":
          return formId;
        case "required":
        case "minLength":
        case "maxLength":
        case "min":
        case "max":
        case "pattern":
        case "step":
        case "multiple":
          return (_state$constraint$nam = state.constraint[name]) === null || _state$constraint$nam === void 0 ? void 0 : _state$constraint$nam[key2];
        case "getFieldList": {
          return () => {
            var _state$initialValue$n;
            var initialValue = (_state$initialValue$n = state.initialValue[name]) !== null && _state$initialValue$n !== void 0 ? _state$initialValue$n : [];
            updateSubjectRef(subjectRef, name, "initialValue", "name");
            if (!Array.isArray(initialValue)) {
              throw new Error("The initial value at the given name is not a list");
            }
            return Array(initialValue.length).fill(0).map((_2, index) => getFieldMetadata(formId, state, subjectRef, name, index));
          };
        }
      }
      return Reflect.get(metadata, key2, receiver);
    }
  });
}
function getFormMetadata(formId, state, subjectRef, context, noValidate) {
  var metadata = getMetadata(formId, state, subjectRef);
  return new Proxy({}, {
    get(_, key, receiver) {
      switch (key) {
        case "context":
          return {
            [wrappedSymbol]: context
          };
        case "status":
          return state.submissionStatus;
        case "validate":
        case "update":
        case "reset":
        case "insert":
        case "remove":
        case "reorder":
          return context[key];
        case "onSubmit":
          return context.submit;
        case "noValidate":
          return noValidate;
      }
      return Reflect.get(metadata, key, receiver);
    }
  });
}
function createFormContext2(options) {
  var {
    onSubmit
  } = options, rest = _objectWithoutProperties(options, _excluded);
  var context = createFormContext(rest);
  return _objectSpread2(_objectSpread2({}, context), {}, {
    submit(event) {
      var submitEvent = event.nativeEvent;
      var result = context.submit(submitEvent);
      if (result.submission && result.submission.status !== "success" && result.submission.error !== null) {
        event.preventDefault();
      } else {
        var _onSubmit;
        (_onSubmit = onSubmit) === null || _onSubmit === void 0 || _onSubmit(event, result);
      }
    },
    onUpdate(options2) {
      onSubmit = options2.onSubmit;
      context.onUpdate(options2);
    }
  });
}

// node_modules/@conform-to/react/hooks.mjs
var _excluded2 = ["id"];
var useSafeLayoutEffect = typeof document === "undefined" ? import_react2.useEffect : import_react2.useLayoutEffect;
function useFormId(preferredId) {
  var id = (0, import_react2.useId)();
  return preferredId !== null && preferredId !== void 0 ? preferredId : id;
}
function useNoValidate() {
  var defaultNoValidate = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : true;
  var [noValidate, setNoValidate] = (0, import_react2.useState)(defaultNoValidate);
  useSafeLayoutEffect(() => {
    if (!noValidate) {
      setNoValidate(true);
    }
  }, [noValidate]);
  return noValidate;
}
function useForm(options) {
  var {
    id
  } = options, formConfig = _objectWithoutProperties(options, _excluded2);
  var formId = useFormId(id);
  var [context] = (0, import_react2.useState)(() => createFormContext2(_objectSpread2(_objectSpread2({}, formConfig), {}, {
    formId
  })));
  useSafeLayoutEffect(() => {
    document.addEventListener("input", context.onInput);
    document.addEventListener("focusout", context.onBlur);
    document.addEventListener("reset", context.onReset);
    return () => {
      document.removeEventListener("input", context.onInput);
      document.removeEventListener("focusout", context.onBlur);
      document.removeEventListener("reset", context.onReset);
    };
  }, [context]);
  useSafeLayoutEffect(() => {
    context.onUpdate(_objectSpread2(_objectSpread2({}, formConfig), {}, {
      formId
    }));
  });
  var subjectRef = useSubjectRef();
  var state = useFormState(context, subjectRef);
  var noValidate = useNoValidate(options.defaultNoValidate);
  var form = getFormMetadata(formId, state, subjectRef, context, noValidate);
  return [form, form.getFieldset()];
}

// node_modules/@conform-to/react/helpers.mjs
function simplify(props) {
  for (var key in props) {
    if (props[key] === void 0) {
      delete props[key];
    }
  }
  return props;
}
function getAriaAttributes(metadata) {
  var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
  if (typeof options.ariaAttributes !== "undefined" && !options.ariaAttributes) {
    return {};
  }
  var invalid = options.ariaInvalid === "allErrors" ? !metadata.valid : typeof metadata.errors !== "undefined";
  var ariaDescribedBy = options.ariaDescribedBy;
  return simplify({
    "aria-invalid": invalid || void 0,
    "aria-describedby": invalid ? "".concat(metadata.errorId, " ").concat(ariaDescribedBy !== null && ariaDescribedBy !== void 0 ? ariaDescribedBy : "").trim() : ariaDescribedBy
  });
}
function getFormProps(metadata, options) {
  return simplify(_objectSpread2({
    id: metadata.id,
    onSubmit: metadata.onSubmit,
    noValidate: metadata.noValidate
  }, getAriaAttributes(metadata, options)));
}
function getFieldsetProps(metadata, options) {
  return simplify(_objectSpread2({
    id: metadata.id,
    name: metadata.name,
    form: metadata.formId
  }, getAriaAttributes(metadata, options)));
}
function getFormControlProps(metadata, options) {
  return simplify(_objectSpread2({
    key: metadata.key,
    required: metadata.required || void 0
  }, getFieldsetProps(metadata, options)));
}
function getInputProps(metadata, options) {
  var props = _objectSpread2(_objectSpread2({}, getFormControlProps(metadata, options)), {}, {
    type: options.type,
    minLength: metadata.minLength,
    maxLength: metadata.maxLength,
    min: metadata.min,
    max: metadata.max,
    step: metadata.step,
    pattern: metadata.pattern,
    multiple: metadata.multiple
  });
  if (typeof options.value === "undefined" || options.value) {
    if (options.type === "checkbox" || options.type === "radio") {
      props.value = typeof options.value === "string" ? options.value : "on";
      props.defaultChecked = typeof metadata.initialValue === "boolean" ? metadata.initialValue : metadata.initialValue === props.value;
    } else if (typeof metadata.initialValue === "string") {
      props.defaultValue = metadata.initialValue;
    }
  }
  return simplify(props);
}

// node_modules/@conform-to/react/integrations.mjs
var import_react3 = __toESM(require_react(), 1);
function getFormElement(formId) {
  var element = document.forms.namedItem(formId);
  if (!element) {
    throw new Error("Form not found");
  }
  return element;
}
function getFieldElements(form, name) {
  var field = form.elements.namedItem(name);
  var elements = !field ? [] : field instanceof Element ? [field] : Array.from(field.values());
  return elements.filter((element) => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement);
}
function getEventTarget(form, name) {
  var _elements$;
  var elements = getFieldElements(form, name);
  return (_elements$ = elements[0]) !== null && _elements$ !== void 0 ? _elements$ : null;
}
function createDummySelect(form, name, value) {
  var select = document.createElement("select");
  var options = typeof value === "string" ? [value] : value !== null && value !== void 0 ? value : [];
  select.name = name;
  select.multiple = true;
  select.dataset.conform = "true";
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.style.position = "absolute";
  select.style.width = "1px";
  select.style.height = "1px";
  select.style.padding = "0";
  select.style.margin = "-1px";
  select.style.overflow = "hidden";
  select.style.clip = "rect(0,0,0,0)";
  select.style.whiteSpace = "nowrap";
  select.style.border = "0";
  for (var option of options) {
    select.options.add(new Option(option, option, true, true));
  }
  form.appendChild(select);
  return select;
}
function isDummySelect(element) {
  return element.dataset.conform === "true";
}
function updateFieldValue(element, value) {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = element.value === value;
  } else if (element instanceof HTMLSelectElement && element.multiple) {
    var selectedValue = Array.isArray(value) ? [...value] : [value];
    for (var option of element.options) {
      var index = selectedValue.indexOf(option.value);
      var selected = index > -1;
      option.selected = selected;
      if (selected) {
        selectedValue.splice(index, 1);
      }
    }
    if (isDummySelect(element)) {
      for (var _option of selectedValue) {
        element.options.add(new Option(_option, _option, false, true));
      }
    }
  } else if (element.value !== value) {
    var {
      set: valueSetter
    } = Object.getOwnPropertyDescriptor(element, "value") || {};
    var prototype = Object.getPrototypeOf(element);
    var {
      set: prototypeValueSetter
    } = Object.getOwnPropertyDescriptor(prototype, "value") || {};
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        throw new Error("The given element does not have a value setter");
      }
    }
  }
}
function useInputControl(metaOrOptions) {
  var inputInitialValue = metaOrOptions.initialValue;
  var eventDispatched = (0, import_react3.useRef)({
    change: false,
    focus: false,
    blur: false
  });
  var [key, setKey] = (0, import_react3.useState)(metaOrOptions.key);
  var [initialValue, setInitialValue] = (0, import_react3.useState)(inputInitialValue);
  var [value, setValue2] = (0, import_react3.useState)(inputInitialValue);
  if (key !== metaOrOptions.key) {
    setValue2(inputInitialValue);
    setInitialValue(inputInitialValue);
    setKey(metaOrOptions.key);
  }
  (0, import_react3.useEffect)(() => {
    var form = getFormElement(metaOrOptions.formId);
    if (getEventTarget(form, metaOrOptions.name)) {
      return;
    }
    createDummySelect(form, metaOrOptions.name, initialValue);
    return () => {
      var elements = getFieldElements(form, metaOrOptions.name);
      for (var element of elements) {
        if (isDummySelect(element)) {
          element.remove();
        }
      }
    };
  }, [metaOrOptions.formId, metaOrOptions.name, initialValue]);
  (0, import_react3.useEffect)(() => {
    var createEventListener = (listener) => {
      return (event) => {
        var _element$form;
        var element = event.target;
        if ((element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.name === metaOrOptions.name && ((_element$form = element.form) === null || _element$form === void 0 ? void 0 : _element$form.id) === metaOrOptions.formId) {
          eventDispatched.current[listener] = true;
        }
      };
    };
    var inputHandler = createEventListener("change");
    var focusHandler = createEventListener("focus");
    var blurHandler = createEventListener("blur");
    document.addEventListener("input", inputHandler, true);
    document.addEventListener("focusin", focusHandler, true);
    document.addEventListener("focusout", blurHandler, true);
    return () => {
      document.removeEventListener("input", inputHandler, true);
      document.removeEventListener("focusin", focusHandler, true);
      document.removeEventListener("focusout", blurHandler, true);
    };
  }, [metaOrOptions.formId, metaOrOptions.name]);
  var handlers = (0, import_react3.useMemo)(() => {
    return {
      change(value2) {
        if (!eventDispatched.current.change) {
          eventDispatched.current.change = true;
          var form = getFormElement(metaOrOptions.formId);
          var element = getEventTarget(form, metaOrOptions.name);
          if (element) {
            updateFieldValue(element, value2);
            element.dispatchEvent(new InputEvent("input", {
              bubbles: true
            }));
            element.dispatchEvent(new Event("change", {
              bubbles: true
            }));
          }
        }
        setValue2(value2);
        eventDispatched.current.change = false;
      },
      focus() {
        if (!eventDispatched.current.focus) {
          eventDispatched.current.focus = true;
          var form = getFormElement(metaOrOptions.formId);
          var element = getEventTarget(form, metaOrOptions.name);
          if (element) {
            element.dispatchEvent(new FocusEvent("focusin", {
              bubbles: true
            }));
            element.dispatchEvent(new FocusEvent("focus"));
          }
        }
        eventDispatched.current.focus = false;
      },
      blur() {
        if (!eventDispatched.current.blur) {
          eventDispatched.current.blur = true;
          var form = getFormElement(metaOrOptions.formId);
          var element = getEventTarget(form, metaOrOptions.name);
          if (element) {
            element.dispatchEvent(new FocusEvent("focusout", {
              bubbles: true
            }));
            element.dispatchEvent(new FocusEvent("blur"));
          }
        }
        eventDispatched.current.blur = false;
      }
    };
  }, [metaOrOptions.formId, metaOrOptions.name]);
  return _objectSpread2(_objectSpread2({}, handlers), {}, {
    value
  });
}

// node_modules/@conform-to/zod/_virtual/_rollupPluginBabelHelpers.mjs
function ownKeys3(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread23(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys3(Object(t), true).forEach(function(r2) {
      _defineProperty3(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys3(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _defineProperty3(obj, key, value) {
  key = _toPropertyKey3(key);
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _toPrimitive3(input, hint) {
  if (typeof input !== "object" || input === null)
    return input;
  var prim = input[Symbol.toPrimitive];
  if (prim !== void 0) {
    var res = prim.call(input, hint || "default");
    if (typeof res !== "object")
      return res;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (hint === "string" ? String : Number)(input);
}
function _toPropertyKey3(arg) {
  var key = _toPrimitive3(arg, "string");
  return typeof key === "symbol" ? key : String(key);
}

// node_modules/@conform-to/zod/constraint.mjs
var keys = ["required", "minLength", "maxLength", "min", "max", "step", "multiple", "pattern"];
function getZodConstraint(schema) {
  function updateConstraint(schema2, data) {
    var _data$name;
    var name = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "";
    var constraint = name !== "" ? (_data$name = data[name]) !== null && _data$name !== void 0 ? _data$name : data[name] = {
      required: true
    } : {};
    if (schema2 instanceof ZodObject) {
      for (var key in schema2.shape) {
        updateConstraint(schema2.shape[key], data, name ? "".concat(name, ".").concat(key) : key);
      }
    } else if (schema2 instanceof ZodEffects) {
      updateConstraint(schema2.innerType(), data, name);
    } else if (schema2 instanceof ZodPipeline) {
      updateConstraint(schema2._def.out, data, name);
    } else if (schema2 instanceof ZodIntersection) {
      var leftResult = {};
      var rightResult = {};
      updateConstraint(schema2._def.left, leftResult, name);
      updateConstraint(schema2._def.right, rightResult, name);
      Object.assign(data, leftResult, rightResult);
    } else if (schema2 instanceof ZodUnion || schema2 instanceof ZodDiscriminatedUnion) {
      Object.assign(data, schema2.options.map((option) => {
        var result2 = {};
        updateConstraint(option, result2, name);
        return result2;
      }).reduce((prev, next) => {
        var list = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(next)]);
        var result2 = {};
        for (var _name of list) {
          var prevConstraint = prev[_name];
          var nextConstraint = next[_name];
          if (prevConstraint && nextConstraint) {
            var _constraint = {};
            result2[_name] = _constraint;
            for (var _key of keys) {
              if (typeof prevConstraint[_key] !== "undefined" && typeof nextConstraint[_key] !== "undefined" && prevConstraint[_key] === nextConstraint[_key]) {
                _constraint[_key] = prevConstraint[_key];
              }
            }
          } else {
            result2[_name] = _objectSpread23(_objectSpread23(_objectSpread23({}, prevConstraint), nextConstraint), {}, {
              required: false
            });
          }
        }
        return result2;
      }));
    } else if (name === "") {
      throw new Error("Unsupported schema");
    } else if (schema2 instanceof ZodArray) {
      constraint.multiple = true;
      updateConstraint(schema2.element, data, "".concat(name, "[]"));
    } else if (schema2 instanceof ZodString) {
      if (schema2.minLength !== null) {
        constraint.minLength = schema2.minLength;
      }
      if (schema2.maxLength !== null) {
        constraint.maxLength = schema2.maxLength;
      }
    } else if (schema2 instanceof ZodOptional) {
      constraint.required = false;
      updateConstraint(schema2.unwrap(), data, name);
    } else if (schema2 instanceof ZodDefault) {
      constraint.required = false;
      updateConstraint(schema2.removeDefault(), data, name);
    } else if (schema2 instanceof ZodNumber) {
      if (schema2.minValue !== null) {
        constraint.min = schema2.minValue;
      }
      if (schema2.maxValue !== null) {
        constraint.max = schema2.maxValue;
      }
    } else if (schema2 instanceof ZodEnum) {
      constraint.pattern = schema2.options.map((option) => (
        // To escape unsafe characters on regex
        option.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d")
      )).join("|");
    } else if (schema2 instanceof ZodTuple) {
      for (var i = 0; i < schema2.items.length; i++) {
        updateConstraint(schema2.items[i], data, "".concat(name, "[").concat(i, "]"));
      }
    } else
      ;
  }
  var result = {};
  updateConstraint(schema, result);
  return result;
}

// node_modules/@conform-to/zod/coercion.mjs
function coerceString(value, transform) {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "") {
    return void 0;
  }
  if (typeof transform !== "function") {
    return value;
  }
  return transform(value);
}
function coerceFile(file) {
  if (typeof File !== "undefined" && file instanceof File && file.name === "" && file.size === 0) {
    return void 0;
  }
  return file;
}
function isFileSchema(schema) {
  if (typeof File === "undefined") {
    return false;
  }
  return schema._def.effect.type === "refinement" && schema.innerType() instanceof ZodAny && schema.safeParse(new File([], "")).success && !schema.safeParse("").success;
}
function enableTypeCoercion(type) {
  var cache = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : /* @__PURE__ */ new Map();
  var result = cache.get(type);
  if (result) {
    return result;
  }
  var schema = type;
  if (type instanceof ZodString || type instanceof ZodLiteral || type instanceof ZodEnum || type instanceof ZodNativeEnum) {
    schema = anyType().transform((value) => coerceString(value)).pipe(type);
  } else if (type instanceof ZodNumber) {
    schema = anyType().transform((value) => coerceString(value, (text) => text.trim() === "" ? Number.NaN : Number(text))).pipe(type);
  } else if (type instanceof ZodBoolean) {
    schema = anyType().transform((value) => coerceString(value, (text) => text === "on" ? true : text)).pipe(type);
  } else if (type instanceof ZodDate) {
    schema = anyType().transform((value) => coerceString(value, (timestamp) => {
      var date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return date;
    })).pipe(type);
  } else if (type instanceof ZodBigInt) {
    schema = anyType().transform((value) => coerceString(value, BigInt)).pipe(type);
  } else if (type instanceof ZodArray) {
    schema = anyType().transform((value) => {
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === "undefined" || typeof coerceFile(value) === "undefined") {
        return [];
      }
      return [value];
    }).pipe(new ZodArray(_objectSpread23(_objectSpread23({}, type._def), {}, {
      type: enableTypeCoercion(type.element, cache)
    })));
  } else if (type instanceof ZodObject) {
    var _shape = Object.fromEntries(Object.entries(type.shape).map((_ref) => {
      var [key, def] = _ref;
      return [
        key,
        // @ts-expect-error see message above
        enableTypeCoercion(def, cache)
      ];
    }));
    schema = new ZodObject(_objectSpread23(_objectSpread23({}, type._def), {}, {
      shape: () => _shape
    }));
  } else if (type instanceof ZodEffects) {
    if (isFileSchema(type)) {
      schema = anyType().transform((value) => coerceFile(value)).pipe(type);
    } else {
      schema = new ZodEffects(_objectSpread23(_objectSpread23({}, type._def), {}, {
        schema: enableTypeCoercion(type.innerType(), cache)
      }));
    }
  } else if (type instanceof ZodOptional) {
    schema = anyType().transform((value) => coerceFile(coerceString(value))).pipe(new ZodOptional(_objectSpread23(_objectSpread23({}, type._def), {}, {
      innerType: enableTypeCoercion(type.unwrap(), cache)
    })));
  } else if (type instanceof ZodDefault) {
    schema = anyType().transform((value) => coerceFile(coerceString(value))).pipe(new ZodDefault(_objectSpread23(_objectSpread23({}, type._def), {}, {
      innerType: enableTypeCoercion(type.removeDefault(), cache)
    })));
  } else if (type instanceof ZodCatch) {
    schema = new ZodCatch(_objectSpread23(_objectSpread23({}, type._def), {}, {
      innerType: enableTypeCoercion(type.removeCatch(), cache)
    }));
  } else if (type instanceof ZodIntersection) {
    schema = new ZodIntersection(_objectSpread23(_objectSpread23({}, type._def), {}, {
      left: enableTypeCoercion(type._def.left, cache),
      right: enableTypeCoercion(type._def.right, cache)
    }));
  } else if (type instanceof ZodUnion) {
    schema = new ZodUnion(_objectSpread23(_objectSpread23({}, type._def), {}, {
      options: type.options.map((option) => enableTypeCoercion(option, cache))
    }));
  } else if (type instanceof ZodDiscriminatedUnion) {
    schema = new ZodDiscriminatedUnion(_objectSpread23(_objectSpread23({}, type._def), {}, {
      options: type.options.map((option) => enableTypeCoercion(option, cache)),
      optionsMap: new Map(Array.from(type.optionsMap.entries()).map((_ref2) => {
        var [discriminator, option] = _ref2;
        return [discriminator, enableTypeCoercion(option, cache)];
      }))
    }));
  } else if (type instanceof ZodTuple) {
    schema = new ZodTuple(_objectSpread23(_objectSpread23({}, type._def), {}, {
      items: type.items.map((item) => enableTypeCoercion(item, cache))
    }));
  } else if (type instanceof ZodNullable) {
    schema = new ZodNullable(_objectSpread23(_objectSpread23({}, type._def), {}, {
      innerType: enableTypeCoercion(type.unwrap(), cache)
    }));
  } else if (type instanceof ZodPipeline) {
    schema = new ZodPipeline(_objectSpread23(_objectSpread23({}, type._def), {}, {
      in: enableTypeCoercion(type._def.in, cache),
      out: enableTypeCoercion(type._def.out, cache)
    }));
  } else if (type instanceof ZodLazy) {
    schema = lazyType(() => enableTypeCoercion(type.schema, cache));
  }
  if (type !== schema) {
    cache.set(type, schema);
  }
  return schema;
}

// node_modules/@conform-to/zod/parse.mjs
function getError(zodError, formatError) {
  var result = {};
  for (var issue of zodError.errors) {
    var name = formatPaths(issue.path);
    switch (issue.message) {
      case conformZodMessage.VALIDATION_UNDEFINED:
        return null;
      case conformZodMessage.VALIDATION_SKIPPED:
        result[name] = null;
        break;
      default: {
        var _issues = result[name];
        if (_issues !== null) {
          if (_issues) {
            result[name] = _issues.concat(issue);
          } else {
            result[name] = [issue];
          }
        }
        break;
      }
    }
  }
  return Object.entries(result).reduce((result2, _ref) => {
    var [name2, issues] = _ref;
    result2[name2] = issues ? formatError(issues) : null;
    return result2;
  }, {});
}
function parseWithZod(payload, options) {
  return parse(payload, {
    resolve(payload2, intent) {
      var errorMap = options.errorMap;
      var schema = enableTypeCoercion(typeof options.schema === "function" ? options.schema(intent) : options.schema);
      var resolveSubmission = (result) => {
        var _options$formatError;
        return {
          value: result.success ? result.data : void 0,
          error: !result.success ? getError(result.error, (_options$formatError = options.formatError) !== null && _options$formatError !== void 0 ? _options$formatError : (issues) => issues.map((issue) => issue.message)) : void 0
        };
      };
      return options.async ? schema.safeParseAsync(payload2, {
        errorMap
      }).then((result) => resolveSubmission(result)) : resolveSubmission(schema.safeParse(payload2, {
        errorMap
      }));
    }
  });
}
var conformZodMessage = {
  VALIDATION_SKIPPED: "__skipped__",
  VALIDATION_UNDEFINED: "__undefined__"
};

export {
  useForm,
  useInputControl,
  getFormProps,
  getInputProps,
  getZodConstraint,
  parseWithZod
};
//# sourceMappingURL=/build/_shared/chunk-I6VWVMMK.js.map
