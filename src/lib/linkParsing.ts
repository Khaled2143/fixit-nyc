const SUPPORTED_VIDEO_LINK_HOSTS = ["tiktok.com", "instagram.com"];

export function isSupportedVideoLink(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return SUPPORTED_VIDEO_LINK_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}
