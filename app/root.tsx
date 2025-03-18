import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { MetaFunction } from "@remix-run/node";

import styles from "./styles/tailwind.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Healthcare Claims Processor" },
    { name: "description", content: "Process and analyze healthcare claims data" },
  ];
};

export function links() {
  return [{ rel: "stylesheet", href: styles }];
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <title>Error!</title>
      </head>
      <body className="bg-gray-50 min-h-screen">
        <div className="max-w-4xl mx-auto p-6 mt-10">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Application Error</h1>
          <p className="text-gray-700 mb-4">We&apos;re sorry, something went wrong.</p>
          <div className="bg-red-50 border border-red-200 p-4 rounded-md">
            <p className="font-mono text-sm">{error.message}</p>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Please try again or contact support if the problem persists.
          </p>
        </div>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}