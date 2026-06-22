import ContentTransition from "../components/ContentTransition";

export default function SiteTemplate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ContentTransition>{children}</ContentTransition>;
}
