// Readable device names from a browser's user-agent string. Used on the "Signed-in devices" list and in the
// new-sign-in alert email. A user-agent can be faked, so this is for display only — never for security decisions.

/** "Chrome on Windows", "Safari on iOS"; falls back to whatever part is recognisable, then to the raw string. */
export function deviceName(ua) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua.slice(0, 80);
}

/** True for phones and tablets. */
export const isMobileDevice = (ua) => /Mobile|Android|iPhone|iPad|iPod/i.test(ua ?? '');
