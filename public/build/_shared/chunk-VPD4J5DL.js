// node_modules/@epic-web/invariant/dist/index.js
var InvariantError = class extends Error {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, InvariantError.prototype);
  }
};
function invariant(condition, message) {
  if (!condition) {
    throw new InvariantError(typeof message === "function" ? message() : message);
  }
}

export {
  invariant
};
//# sourceMappingURL=/build/_shared/chunk-VPD4J5DL.js.map
