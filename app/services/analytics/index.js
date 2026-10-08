// Compatibility facade for existing event callers. Usage analytics is removed;
// no SDK is loaded, device information collected, or network request made.
export const analyticsService = {
  init: async () => {},
  sendEvent: async () => {},
  sendDeviceInfo: async () => {},
};
