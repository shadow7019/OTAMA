/**
 * /home — alias of the main app (/).
 *
 * Exists as an edge-cache escape hatch: the platform's public gateway
 * (Aliyun FC) caches GET / HTML aggressively, so when the root page is
 * served stale, https://<host>/home always reaches the live origin.
 */
export { default } from '../page'
