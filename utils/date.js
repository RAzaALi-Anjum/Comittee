export const TIME_ZONE = "Asia/Karachi";
const localeFor = (lang) => (lang === "ur" ? "ur-PK" : "en-PK");
const toDateObj = (value) => {
  if (value?.toDate?.()) return value.toDate();
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return value instanceof Date ? value : new Date();
};
export const formatDate = (value, lang) => {
  const d = toDateObj(value);
  try {
    return d.toLocaleDateString(localeFor(lang), { timeZone: TIME_ZONE });
  } catch {
    return d.toLocaleDateString();
  }
};
export const formatDateTime = (value, lang) => {
  const d = toDateObj(value);
  try {
    return d.toLocaleString(localeFor(lang), { timeZone: TIME_ZONE });
  } catch {
    return d.toLocaleString();
  }
};
