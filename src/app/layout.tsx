export const metadata = {
  title: "BookWise",
  description: "Team scheduling and booking platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
