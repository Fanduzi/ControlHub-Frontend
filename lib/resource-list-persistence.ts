const LIST_URL_KEY = "controlhub_resource_list_url";

export function saveResourceListUrl(url: string) {
  try {
    sessionStorage.setItem(LIST_URL_KEY, url);
  } catch {
    // ignore quota or security errors
  }
}

export function loadResourceListUrl(): string | null {
  try {
    return sessionStorage.getItem(LIST_URL_KEY);
  } catch {
    return null;
  }
}
