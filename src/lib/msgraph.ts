/**
 * Microsoft Graph integration layer.
 *
 * A single authenticated connection powers Outlook mail, Calendar, Teams,
 * OneDrive and Contacts. MSAL is imported lazily so nothing browser-only ever
 * runs during SSR, and the whole module degrades gracefully when no Azure app
 * registration has been supplied yet.
 *
 * To activate: add VITE_MS_CLIENT_ID (Azure app registration client ID) and
 * optionally VITE_MS_TENANT_ID to the environment.
 */

import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";

export const GRAPH_SCOPES = [
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
  "Contacts.Read",
  "Files.Read",
  "Chat.Read",
];

export const clientId = import.meta.env.VITE_MS_CLIENT_ID as string | undefined;
const tenantId = (import.meta.env.VITE_MS_TENANT_ID as string | undefined) ?? "common";

export function isGraphConfigured() {
  return typeof clientId === "string" && clientId.length > 0;
}

let msalPromise: Promise<PublicClientApplication> | null = null;

async function getMsal(): Promise<PublicClientApplication> {
  if (!isGraphConfigured()) throw new Error("Microsoft integration is not configured yet.");
  if (!msalPromise) {
    msalPromise = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const app = new PublicClientApplication({
        auth: {
          clientId: clientId!,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "localStorage" },
      });
      await app.initialize();
      await app.handleRedirectPromise().catch(() => null);
      return app;
    })();
  }
  return msalPromise;
}

export async function currentAccount(): Promise<AccountInfo | null> {
  if (!isGraphConfigured() || typeof window === "undefined") return null;
  const app = await getMsal();
  return app.getAllAccounts()[0] ?? null;
}

export async function signIn(): Promise<AccountInfo> {
  const app = await getMsal();
  const result = await app.loginPopup({ scopes: GRAPH_SCOPES, prompt: "select_account" });
  app.setActiveAccount(result.account);
  return result.account;
}

export async function signOut(): Promise<void> {
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (account) await app.logoutPopup({ account });
}

async function accessToken(): Promise<string> {
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (!account) throw new Error("No Microsoft account connected.");
  try {
    const res = await app.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
    return res.accessToken;
  } catch {
    const res = await app.acquireTokenPopup({ scopes: GRAPH_SCOPES, account });
    return res.accessToken;
  }
}

/** Typed GET against the Graph v1.0 endpoint. */
export async function graphGet<T>(path: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft Graph request failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as T;
}

/* ---------------- Domain shapes + readers ---------------- */

export type GraphMail = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  bodyPreview: string;
  receivedDateTime: string;
  isRead: boolean;
};

export type GraphEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
};

export type GraphChat = {
  id: string;
  topic?: string;
  chatType: string;
  lastUpdatedDateTime: string;
};

export type GraphDriveItem = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime: string;
  webUrl: string;
};

export type GraphContact = {
  id: string;
  displayName: string;
  emailAddresses?: { address: string; name?: string }[];
};

export const graph = {
  me: () => graphGet<{ displayName: string; mail?: string; userPrincipalName: string }>("/me"),
  mail: async () => {
    const [inbox, unread] = await Promise.all([
      graphGet<{ value: GraphMail[] }>(
        "/me/mailFolders/inbox/messages?$top=5&$select=id,subject,from,bodyPreview,receivedDateTime,isRead&$orderby=receivedDateTime desc",
      ),
      graphGet<{ unreadItemCount: number }>("/me/mailFolders/inbox?$select=unreadItemCount"),
    ]);
    return { messages: inbox.value, unread: unread.unreadItemCount };
  },
  events: async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const res = await graphGet<{ value: GraphEvent[] }>(
      `/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=10&$orderby=start/dateTime&$select=id,subject,start,end,location`,
    );
    return res.value;
  },
  chats: async () =>
    (await graphGet<{ value: GraphChat[] }>("/me/chats?$top=5&$orderby=lastUpdatedDateTime desc"))
      .value,
  files: async () =>
    (
      await graphGet<{ value: GraphDriveItem[] }>(
        "/me/drive/recent?$top=6&$select=id,name,size,lastModifiedDateTime,webUrl",
      )
    ).value,
  contacts: async () =>
    (
      await graphGet<{ value: GraphContact[] }>(
        "/me/contacts?$top=50&$select=id,displayName,emailAddresses",
      )
    ).value,
};
