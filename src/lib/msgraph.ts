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
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.Read",
  "Calendars.ReadWrite",
  "Contacts.Read",
  "Files.Read",
  "Chat.Read",
  "Tasks.ReadWrite",
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

/** Typed POST against the Graph v1.0 endpoint, for sending mail, creating drafts/events, etc. */
export async function graphPost<T>(path: string, body: unknown): Promise<T | null> {
  const token = await accessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Microsoft Graph request failed [${res.status}]: ${errBody}`);
  }
  // Several write endpoints (e.g. /me/sendMail) return 202 with an empty body.
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
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

export type GraphTask = {
  id: string;
  title: string;
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  dueDateTime?: { dateTime: string; timeZone: string };
  body?: { content: string; contentType: string };
};

let defaultTaskListId: string | null = null;

/** Resolves (and caches) the id of Felix's default Microsoft To Do list. */
async function getDefaultTaskListId(): Promise<string> {
  if (defaultTaskListId) return defaultTaskListId;
  const res = await graphGet<{ value: { id: string; wellknownListName?: string }[] }>(
    "/me/todo/lists?$select=id,wellknownListName",
  );
  const list = res.value.find((l) => l.wellknownListName === "defaultList") ?? res.value[0];
  if (!list) throw new Error("No Microsoft To Do task list found for this account.");
  defaultTaskListId = list.id;
  return list.id;
}

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
  /** Reads a specific message's full body by id (not just the list preview). */
  readMail: (id: string) =>
    graphGet<{
      subject: string;
      from?: GraphMail["from"];
      body: { content: string; contentType: string };
      receivedDateTime: string;
    }>(`/me/messages/${encodeURIComponent(id)}?$select=subject,from,body,receivedDateTime`),
  /** Searches the inbox by subject/sender/body keyword. */
  searchMail: async (query: string) =>
    (
      await graphGet<{ value: GraphMail[] }>(
        `/me/messages?$search="${encodeURIComponent(query)}"&$top=5&$select=id,subject,from,bodyPreview,receivedDateTime,isRead`,
      )
    ).value,
  /** Creates a draft in the Drafts folder — does NOT send it. */
  draftMail: (to: string, subject: string, bodyHtml: string) =>
    graphPost<{ id: string; webLink: string }>("/me/messages", {
      subject,
      body: { contentType: "HTML", content: bodyHtml },
      toRecipients: [{ emailAddress: { address: to } }],
    }),
  /** Sends a message immediately — only call this after Felix has explicitly confirmed. */
  sendMail: (to: string, subject: string, bodyHtml: string) =>
    graphPost<null>("/me/sendMail", {
      message: {
        subject,
        body: { contentType: "HTML", content: bodyHtml },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
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
  /** Creates a calendar event. start/end are ISO 8601 local datetimes (no "Z"); timeZone defaults to UTC. */
  createEvent: (
    subject: string,
    startIso: string,
    endIso: string,
    opts?: { location?: string; timeZone?: string; attendees?: string[] },
  ) =>
    graphPost<{ id: string; webLink: string }>("/me/events", {
      subject,
      start: { dateTime: startIso, timeZone: opts?.timeZone ?? "UTC" },
      end: { dateTime: endIso, timeZone: opts?.timeZone ?? "UTC" },
      ...(opts?.location ? { location: { displayName: opts.location } } : {}),
      ...(opts?.attendees?.length
        ? {
            attendees: opts.attendees.map((a) => ({
              emailAddress: { address: a },
              type: "required",
            })),
          }
        : {}),
    }),
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
  /** Lists open (non-completed) tasks from Felix's default Microsoft To Do list. */
  tasks: async () => {
    const listId = await getDefaultTaskListId();
    const res = await graphGet<{ value: GraphTask[] }>(
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=25&$select=id,title,status,dueDateTime&$filter=status ne 'completed'`,
    );
    return res.value;
  },
  /** Creates a task in Felix's default Microsoft To Do list. dueIso is a local ISO datetime (no "Z"). */
  createTask: async (
    title: string,
    opts?: { dueIso?: string; notes?: string; timeZone?: string },
  ) => {
    const listId = await getDefaultTaskListId();
    return graphPost<{ id: string }>(`/me/todo/lists/${encodeURIComponent(listId)}/tasks`, {
      title,
      ...(opts?.dueIso
        ? { dueDateTime: { dateTime: opts.dueIso, timeZone: opts?.timeZone ?? "UTC" } }
        : {}),
      ...(opts?.notes ? { body: { content: opts.notes, contentType: "text" } } : {}),
    });
  },
};
