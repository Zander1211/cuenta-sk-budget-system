/**
 * deviceInfo.js
 *
 * Returns a concise, human-readable device / browser summary string
 * derived from navigator.userAgent. Used by the audit trail to record
 * the client environment for every logged action.
 */

/**
 * Parse navigator.userAgent into a short summary string.
 * Example outputs:
 *   "Chrome 126 on Windows"
 *   "Firefox 127 on macOS"
 *   "Safari 17 on iOS"
 *   "Edge 124 on Windows"
 *
 * @returns {string}
 */
export function getDeviceInfo() {
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent || ''

  let browser = 'Unknown Browser'
  let os = 'Unknown OS'

  // ── Detect Browser ───────────────────────────────────────────
  if (/Edg\/(\d+)/.test(ua)) {
    browser = `Edge ${ua.match(/Edg\/(\d+)/)[1]}`
  } else if (/OPR\/(\d+)/.test(ua) || /Opera\/(\d+)/.test(ua)) {
    const v = ua.match(/OPR\/(\d+)/) || ua.match(/Opera\/(\d+)/)
    browser = `Opera ${v[1]}`
  } else if (/Chrome\/(\d+)/.test(ua) && !/Chromium/.test(ua)) {
    browser = `Chrome ${ua.match(/Chrome\/(\d+)/)[1]}`
  } else if (/Firefox\/(\d+)/.test(ua)) {
    browser = `Firefox ${ua.match(/Firefox\/(\d+)/)[1]}`
  } else if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) {
    const v = ua.match(/Version\/(\d+)/)
    browser = v ? `Safari ${v[1]}` : 'Safari'
  } else if (/MSIE (\d+)|Trident.*rv:(\d+)/.test(ua)) {
    const v = ua.match(/MSIE (\d+)/) || ua.match(/rv:(\d+)/)
    browser = `Internet Explorer ${v[1]}`
  } else if (/Chromium\/(\d+)/.test(ua)) {
    browser = `Chromium ${ua.match(/Chromium\/(\d+)/)[1]}`
  }

  // ── Detect OS ────────────────────────────────────────────────
  if (/Windows NT 10/.test(ua)) {
    os = 'Windows 10/11'
  } else if (/Windows NT 6\.3/.test(ua)) {
    os = 'Windows 8.1'
  } else if (/Windows NT 6\.1/.test(ua)) {
    os = 'Windows 7'
  } else if (/Windows/.test(ua)) {
    os = 'Windows'
  } else if (/iPhone/.test(ua)) {
    os = 'iOS (iPhone)'
  } else if (/iPad/.test(ua)) {
    os = 'iOS (iPad)'
  } else if (/Android/.test(ua)) {
    const v = ua.match(/Android ([\d.]+)/)
    os = v ? `Android ${v[1]}` : 'Android'
  } else if (/Mac OS X/.test(ua)) {
    os = 'macOS'
  } else if (/Linux/.test(ua)) {
    os = 'Linux'
  } else if (/CrOS/.test(ua)) {
    os = 'Chrome OS'
  }

  return `${browser} on ${os}`
}
