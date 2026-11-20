export function taskIdFromHash(hash: string): string | null {
  const m = /^#\/task\/([^/?#]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}

export function taskHref(id: string): string {
  return `#/task/${encodeURIComponent(id)}`;
}

export function goBack() {
  window.location.hash = "";
}
