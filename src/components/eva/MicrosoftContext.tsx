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

type MicrosoftApi = GraphData & {
  configured: boolean;
  connected: boolean;
  account: string | null;
  loading: boolean;
  error: string | null;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, mail, events, chats, files, contacts] = await Promise.all([
        graph.me(),
        graph.mail().catch(() => ({ messages: [] as GraphMail[], unread: 0 })),
        graph.events().catch(() => [] as GraphEvent[]),
        graph.chats().catch(() => [] as GraphChat[]),
        graph.files().catch(() => [] as GraphDriveItem[]),
        graph.contacts().catch(() => [] as GraphContact[]),
      ]);
      setAccount(me.displayName || me.mail || me.userPrincipalName);
      setData({ mail: mail.messages, unread: mail.unread, events, chats, files, contacts });
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
  }, []);

  const value = useMemo<MicrosoftApi>(
    () => ({
      ...data,
      configured,
      connected: !!account,
      account,
      loading,
      error,
      connect,
      disconnect,
      refresh: load,
    }),
    [data, configured, account, loading, error, connect, disconnect, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
