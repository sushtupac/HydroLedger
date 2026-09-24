import "./globals.css";
import Providers from "./providers";
export const metadata = { title: "HydroLedger", description: "Verified green credits from Nepal's village hydropower" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
