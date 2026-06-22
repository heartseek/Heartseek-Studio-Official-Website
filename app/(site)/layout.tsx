import { cookies } from "next/headers";
import SiteI18nProvider from "../_i18n/I18nProvider";
import {
  DEFAULT_SITE_LANGUAGE,
  SITE_LANGUAGE_COOKIE_KEY,
  resolveSiteLanguage,
} from "../_i18n/locales";
import SiteShell from "../components/SiteShell";

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialLocale =
    resolveSiteLanguage(cookieStore.get(SITE_LANGUAGE_COOKIE_KEY)?.value) ??
    DEFAULT_SITE_LANGUAGE;

  return (
    <SiteI18nProvider initialLocale={initialLocale}>
      <SiteShell>{children}</SiteShell>
    </SiteI18nProvider>
  );
}
