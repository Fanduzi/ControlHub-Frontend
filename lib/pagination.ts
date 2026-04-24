export function appendRepeated(
  searchParams: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    searchParams.append(key, v);
  }
}
