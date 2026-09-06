import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
});

function RootComponent() {
  const context = Route.useRouteContext();
  const { queryClient } = context || {};

  return (
    <QueryClientProvider client={queryClient!}>
      <div className="bg-canvas text-ink min-h-screen selection:bg-coral selection:text-white antialiased font-sans">
        <Outlet />
      </div>
    </QueryClientProvider>
  );
}
