/** Element factory. Text goes through textContent, never innerHTML: screens show server and user data. */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

export const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
