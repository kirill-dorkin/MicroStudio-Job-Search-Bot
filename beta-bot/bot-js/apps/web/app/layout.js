export const metadata = {
  title: 'MicroStudio Job Search',
  description: 'Job search bot and web UI'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', margin: 24 }}>
        {children}
      </body>
    </html>
  );
}

