import enMessages from "./messages/en.json";
import msMessages from "./messages/ms.json";
import zhCNMessages from "./messages/zh-CN.json";
import zhTWMessages from "./messages/zh-TW.json";
import type { SiteLanguageCode } from "./locales";

export const siteMessages = {
  en: enMessages,
  ms: msMessages,
  "zh-CN": zhCNMessages,
  "zh-TW": zhTWMessages,
} satisfies Record<SiteLanguageCode, typeof enMessages>;
