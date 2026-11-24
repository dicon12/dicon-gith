/**
 * Copies the methods of each source class onto target's prototype. Lets a large page controller
 * (AdminDashboard, InnovatorDashboard) keep one `this` while its sections live in separate files.
 * A method defined twice is a mistake, so it throws instead of silently overriding.
 */
export function mixin(target, ...sources) {
  for (const source of sources) {
    for (const name of Object.getOwnPropertyNames(source.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) {
        throw new Error(`mixin: ${target.name}.${name} is already defined (from ${source.name})`);
      }
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name));
    }
  }
  return target;
}
