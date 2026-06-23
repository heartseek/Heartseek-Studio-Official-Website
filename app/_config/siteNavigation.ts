export type SiteNavigationLabelKey =
  | "navigation.home"
  | "navigation.overview"
  | "navigation.explore"
  | "navigation.story";

export type SiteSidebarLink = {
  labelKey: SiteNavigationLabelKey;
  href: `/${string}` | "/";
};

export type SiteSidebarGroup = {
  labelKey: SiteNavigationLabelKey;
  href: `/${string}` | "/";
  items: SiteSidebarLink[];
};

export const directSiteLinks: SiteSidebarLink[] = [
  { labelKey: "navigation.home", href: "/" },
  { labelKey: "navigation.overview", href: "/overview" },
];

export const groupedSiteLinks: SiteSidebarGroup[] = [
  {
    labelKey: "navigation.explore",
    href: "/explore",
    items: [{ labelKey: "navigation.story", href: "/story" }],
  },
];
