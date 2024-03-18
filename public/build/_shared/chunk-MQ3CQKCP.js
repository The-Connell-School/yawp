import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";
import {
  require_react
} from "/build/_shared/chunk-BOXFZXVX.js";
import {
  __toESM
} from "/build/_shared/chunk-PNG5AS42.js";

// app/hooks/useBreakpoint.ts
var import_react = __toESM(require_react(), 1);
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/hooks/useBreakpoint.ts"
  );
  import.meta.hot.lastModified = "1708316645855.8997";
}
var useBreakpoint = () => {
  const [breakpoint, setBreakPoint] = (0, import_react.useState)();
  const [windowSize, setWindowSize] = (0, import_react.useState)();
  const handleResize = () => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight
    });
  };
  (0, import_react.useEffect)(() => {
    window.addEventListener("resize", handleResize);
    handleResize();
    if (!windowSize?.width || !windowSize?.height)
      return;
    if (0 < windowSize.width && windowSize.width < 640) {
      setBreakPoint("base");
    }
    if (640 < windowSize.width && windowSize.width < 768) {
      setBreakPoint("md");
    }
    if (768 < windowSize.width && windowSize.width < 1024) {
      setBreakPoint("lg");
    }
    if (1024 < windowSize.width && windowSize.width < 1280) {
      setBreakPoint("xl");
    }
    if (windowSize.width >= 1280) {
      setBreakPoint("2xl");
    }
    return () => window.removeEventListener("resize", handleResize);
  }, [windowSize?.height, windowSize?.width]);
  return breakpoint;
};
var useBreakpoint_default = useBreakpoint;

export {
  useBreakpoint_default
};
//# sourceMappingURL=/build/_shared/chunk-MQ3CQKCP.js.map
