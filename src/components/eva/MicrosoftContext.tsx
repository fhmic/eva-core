import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  graph,
  isGraphConfigured,
  signIn as msSignIn,
  signOut as msSignOut,
  currentAccount,
  type GraphChat,
  type GraphContact,
  type GraphDriveItem,
  type GraphEvent,
  type GraphMail,
} from "@/lib/msgraph";

type GraphData = {
  mail: GraphMail[];
  unread: number;
  events: GraphEvent[];
  chats: GraphChat[];
  files: GraphDriveItem[];
  contacts: GraphContact[];
};

export type GraphSourceErrors = Partial<Record<"mail" | "events" | "chats" | "files" | "contacts", "string">;

function friendlyGraphError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("[403]") || raw.includes("[401]")) {
    return "Permission denied — this scope likely isn't granted/consented yet in your Azure App Registration.";
  }
  return raw.slice(0, 180);
}

type MicrosoftApi = GraphData & {
  configured: boolean;
  connected: boolean;
  account: string | null;
  loading: boolean;
  error: string | null;
  sourceErrors: GraphSourceErrors;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
};

const EMPTY: GraphData = { mail: [], unread: 0, events: [], chats: [], files: [], contacts: [] };

const Ctx = createContext<MicrosoftApi | null>(null);

export function useMicrosoft() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMicrosoft must be used inside <MicrosoftProvider>");
  return ctx;
}

/**
 * Single integration layer for every Microsoft-backed surface. Other providers
 * can be added later behind the same widget contract.
 */
export function MicrosoftProvider({ children }: { children: ReactNode }) {
  const configured = isGraphConfigured();
  const [account, setAccount] = useState<string | null>(null);
  const [data, setData] = useState<GraphData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<GraphSourceErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const errs: GraphSourceErrors = {};
    try {
      const me = await graph.me();
      setAccount(me.displayName || me.mail || me.userPrincipalName);

      const [mailRes, eventsRes, chatsRes, filesRes, contactsRes] = await Promise.all([
        graph.mail().catch((err) => {
          errs.mail = friendlyGraphError(err);
          return { messages: [] as GraphMail[], unread: 0 };
        }),
        graph.events().catch((err) => {
          errs.events = friendlyGraphError(err);
          return [] as GraphEvent[];
        }),
        graph.chats().catch((err) => {
          errs.chats = friendlyGraphError(err);
          return [] as GraphChat[];
        }),
        graph.files().catch((err) => {
          errs.files = friendlyGraphError(err);
          return [] as GraphDriveItem[];
        }),
        graph.contacts().catch((err) => {
          errs.contacts = friendlyGraphError(err);
          return [] as GraphContact[];
        }),
      ]);
      setData({
        mail: mailRes.messages,
        unread: mailRes.unread,
        events: eventsRes,
        chats: chatsRes,
        files: filesRes,
        contacts: contactsRes,
      });
      setSourceErrors(errs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microsoft Graph is unreachable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void currentAccount().then((acc) => {
      if (active && acc) void load();
    });
    return () => {
      active = false;
    };
  }, [configured, load]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await msSignIn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microsoft sign-in was cancelled.");
    }
  }, [load]);

  const disconnect = useCallback(async () => {
    await msSignOut().catch(() => {});
    setAccount(null);
    setData(EMPTY);
    setSourceErrors({});
  }, []);

  const value = useMemo<MicrosoftApi>(
    () => ({
      ...data,
      configured,
      connected: !!account,
      account,
      loading,
      error,
      sourceErrors,
      connect,
      disconnect,
      refresh: load,
    }),
    [data, configured, account, loading, error, sourceErrors, connect, disconnect, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
