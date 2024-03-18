import {
  createHotContext
} from "/build/_shared/chunk-277OHKIB.js";

// app/utils/timeAgo/timeAgo.ts
if (import.meta) {
  import.meta.hot = createHotContext(
    //@ts-expect-error
    "app/utils/timeAgo/timeAgo.ts"
  );
  import.meta.hot.lastModified = "1708316646013.384";
}
function timeAgo(date) {
  const seconds = Math.floor(((/* @__PURE__ */ new Date()).getTime() - date.getTime()) / 1e3);
  if (seconds < 60)
    return "< a minute ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)
    return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4)
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12)
    return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export {
  timeAgo
};
//# sourceMappingURL=/build/_shared/chunk-HWPOSQYP.js.map
