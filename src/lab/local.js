// Also enable the lab in a production build served by a local preview server.
export const localLab = import.meta.env.DEV ||
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname) ||
  location.hostname.endsWith('.localhost')
