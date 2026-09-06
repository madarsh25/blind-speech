import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import appCss from "../styles/global.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "The Tweeting Platform — Anonymous Workplace Community" },
      { name: "description", content: "Connect anonymously with coworker communities. Verified by work email. Zero-linkage guarantee." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-canvas text-ink min-h-screen selection:bg-coral selection:text-white antialiased font-sans">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const context = Route.useRouteContext();
  console.log("DEBUG - Root Route Context:", context);
  const { queryClient } = context || {};
  return (
    <QueryClientProvider client={queryClient!}>
      <Outlet />
    </QueryClientProvider>
  );
}
