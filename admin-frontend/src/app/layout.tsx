import "./globals.css";

export const metadata = {
  title: "MiniAlgothon Admin Console",
  description: "Management portal for MiniAlgothon contest organizers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
