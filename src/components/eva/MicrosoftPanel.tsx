import { useState } from "react";
import { CalendarDays, CloudDownload, Contact, Inbox, MessagesSquare, Plug } from "lucide-react";
import { HoloPanel } from "./HoloPanel";
import { useMicrosoft } from "./MicrosoftContext";

/** Shared "not connected yet" state — same visual language, never a broken widget. */
function Degraded({ label }: { label: string }) {
  const { configured, connect, error } = useMicrosoft();
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-3 text-center">
      <p className="text-xs text-muted-foreground">
        {configured
          ? `Connect your Microsoft account to enable ${label}.`
          : `${label} activates once a Microsoft app registration is supplied.`}
      </p>
      {configured && (
        <button
          onClick={() => void connect()}
          className="mt-2 rounded-full border border-accent/50 px-3 py-1 text-xs text-accent transition hover:scale-[1.03]"
        >
          Connect Microsoft account
        </button>
      )}
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export function MicrosoftConnectionPanel({ delay }: { delay?: number }) {
  const { configured, connected, account, connect, disconnect, refresh, loading } = useMicrosoft();
  return (
    <HoloPanel
      title="Microsoft Graph"
      icon={<Plug size={14} />}
      delay={delay}
      accent="violet"
      action={
        <span className={`text-xs ${connected ? "text-accent" : "text-muted-foreground"}`}>
          {connected ? "Linked" : configured ? "Standby" : "Unconfigured"}
        </span>
      }
    >
      {connected ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-violet/60 text-xs text-violet">
              {account?.slice(0, 1).toUpperCase()}
            </span>
            <p className="truncate text-sm text-foreground">{account}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void refresh()}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              {loading ? "Syncing…" : "Sync"}
            </button>
            <button
              onClick={() => void disconnect()}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              Unlink
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            One connection powers Outlook mail, Calendar, Teams, OneDrive and Contacts.
          </p>
          {configured ? (
            <button
              onClick={() => void connect()}
              className="w-full rounded-full border border-violet/60 bg-secondary/60 py-1.5 text-xs text-violet transition hover:scale-[1.02]"
            >
              Connect Microsoft account
            </button>
          ) : (
            <p className="rounded-lg border border-dashed border-border/70 bg-secondary/30 p-2 text-[11px] text-muted-foreground">
              Add an Azure app registration client ID to activate delegated access to Mail,
              Calendars, Contacts, Files and Chat.
            </p>
          )}
        </div>
      )}
    </HoloPanel>
  );
}

export function InboxWidget({ delay }: { delay?: number }) {
  const { connected, mail, unread } = useMicrosoft();
  return (
    <HoloPanel
      title="Inbox"
      icon={<Inbox size={14} />}
      delay={delay}
      action={connected ? <span className="text-xs text-accent">{unread} unread</span> : undefined}
    >
      {!connected ? (
        <Degraded label="Outlook mail" />
      ) : mail.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inbox clear.</p>
      ) : (
        <ul className="space-y-2">
          {mail.slice(0, 3).map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 transition hover:border-accent/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-foreground">
                  {m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? "Unknown"}
                </span>
                {!m.isRead && <span className="label-hud shrink-0">New</span>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{m.subject || "(no subject)"}</p>
            </li>
          ))}
        </ul>
      )}
    </HoloPanel>
  );
}

export function ScheduleWidget({ delay }: { delay?: number }) {
  const { connected, events } = useMicrosoft();
  const next = events[0];
  const countdown = next
    ? Math.round((new Date(next.start.dateTime + "Z").getTime() - Date.now()) / 60000)
    : null;

  return (
    <HoloPanel
      title="Schedule"
      icon={<CalendarDays size={14} />}
      delay={delay}
      action={
        countdown !== null && countdown > 0 ? (
          <span className="text-xs text-accent">in {countdown}m</span>
        ) : undefined
      }
    >
      {!connected ? (
        <Degraded label="your Outlook calendar" />
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events in the next seven days.</p>
      ) : (
        <ul className="space-y-2">
          {events.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-center gap-3">
              <span className="font-display text-sm text-accent">
                {new Date(e.start.dateTime + "Z").toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <div className="min-w-0 border-l border-border pl-3">
                <p className="truncate text-sm text-foreground">{e.subject}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.location?.displayName || "No location"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </HoloPanel>
  );
}

export function TeamsWidget({ delay }: { delay?: number }) {
  const { connected, chats } = useMicrosoft();
  return (
    <HoloPanel title="Teams" icon={<MessagesSquare size={14} />} delay={delay} accent="violet">
      {!connected ? (
        <Degraded label="Teams chats" />
      ) : chats.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent conversations.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {chats.slice(0, 4).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-foreground/90">{c.topic || c.chatType}</span>
              <span className="label-hud shrink-0">
                {new Date(c.lastUpdatedDateTime).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </HoloPanel>
  );
}

export function OneDriveWidget({ delay }: { delay?: number }) {
  const { connected, files } = useMicrosoft();
  return (
    <HoloPanel title="OneDrive" icon={<CloudDownload size={14} />} delay={delay} accent="violet">
      {!connected ? (
        <Degraded label="OneDrive files" />
      ) : (
        <ul className="space-y-1.5 text-sm">
          {files.slice(0, 5).map((f) => (
            <li key={f.id}>
              <a
                href={f.webUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-foreground/90 transition hover:text-accent"
              >
                {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </HoloPanel>
  );
}

export function ContactsWidget({ delay }: { delay?: number }) {
  const { connected, contacts } = useMicrosoft();
  return (
    <HoloPanel title="Contacts" icon={<Contact size={14} />} delay={delay} accent="violet">
      {!connected ? (
        <Degraded label="contact lookup" />
      ) : (
        <ContactSearch
          contacts={contacts.map((c) => ({
            id: c.id,
            name: c.displayName,
            email: c.emailAddresses?.[0]?.address ?? "",
          }))}
        />
      )}
    </HoloPanel>
  );
}


function ContactSearch({ contacts }: { contacts: { id: string; name: string; email: string }[] }) {
  const [q, setQ] = useState("");
  const hits = q
    ? contacts
        .filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5)
    : contacts.slice(0, 4);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Look up a contact…"
        aria-label="Search contacts"
        className="h-8 w-full rounded-full border border-border bg-secondary/50 px-3 text-xs outline-none focus:border-accent/60"
      />
      <ul className="mt-2 space-y-1 text-sm">
        {hits.map((c) => (
          <li key={c.id} className="truncate">
            <span className="text-foreground/90">{c.name}</span>{" "}
            <span className="text-xs text-muted-foreground">{c.email}</span>
          </li>
        ))}
        {hits.length === 0 && <li className="text-xs text-muted-foreground">No matches.</li>}
      </ul>
    </div>
  );
}
