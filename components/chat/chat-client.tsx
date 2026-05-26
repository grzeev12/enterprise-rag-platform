"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Copy, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/knowledge/status-badge";

type WorkspaceOption = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
};

type Citation = {
  id: string;
  sourceUrl: string | null;
  title: string | null;
  score: number;
  quote: string;
};

type Message = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
  citations: Citation[];
};

type Chat = {
  id: string;
  title: string;
  messages?: Message[];
};

export function ChatClient({
  workspaces,
  initialChats,
  initialChat
}: {
  workspaces: WorkspaceOption[];
  initialChats: Chat[];
  initialChat: Chat | null;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId), [workspaceId, workspaces]);
  const [chats, setChats] = useState(initialChats);
  const [activeChat, setActiveChat] = useState<Chat | null>(initialChat);
  const [messages, setMessages] = useState<Message[]>(initialChat?.messages ?? []);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshChats(chatId?: string) {
    if (!workspace) return;
    const response = await fetch(`/api/chats?organizationId=${workspace.organizationId}&workspaceId=${workspace.id}`);
    const body = await response.json();
    setChats(body.chats ?? []);
    if (chatId) {
      const chatResponse = await fetch(`/api/chats/${chatId}`);
      const chatBody = await chatResponse.json();
      if (chatBody.chat) {
        setActiveChat(chatBody.chat);
        setMessages(chatBody.chat.messages ?? []);
      }
    }
  }

  function newChat() {
    if (!workspace) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          title: "New chat"
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Unable to create chat");
        return;
      }
      setActiveChat(body.chat);
      setMessages([]);
      await refreshChats(body.chat.id);
    });
  }

  async function selectChat(chatId: string) {
    const response = await fetch(`/api/chats/${chatId}`);
    const body = await response.json();
    if (body.chat) {
      setActiveChat(body.chat);
      setMessages(body.chat.messages ?? []);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    setError(null);

    let chat = activeChat;
    if (!chat) {
      if (!workspace) return;
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          title: input.slice(0, 80)
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Unable to create chat");
        return;
      }
      chat = body.chat;
      setActiveChat(chat);
    }

    if (!chat) return;

    const userText = input.trim();
    setInput("");
    const optimisticUser: Message = {
      id: crypto.randomUUID(),
      role: "USER",
      content: userText,
      citations: []
    };
    const optimisticAssistant: Message = {
      id: crypto.randomUUID(),
      role: "ASSISTANT",
      content: "",
      citations: []
    };
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);

    const response = await fetch(`/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: userText })
    });

    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Unable to send message");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      assistantText += decoder.decode(value, { stream: true });
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticAssistant.id ? { ...message, content: assistantText } : message
        )
      );
    }

    await refreshChats(chat.id);
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-0 overflow-hidden rounded-lg border lg:grid-cols-[280px_1fr_320px]">
      <aside className="border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
        <div className="mb-3 space-y-2">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.organizationName} / {item.name}
              </option>
            ))}
          </select>
          <Button className="w-full" disabled={isPending || !workspaceId} onClick={newChat} type="button">
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        <div className="space-y-1">
          {chats.map((chat) => (
            <button
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              key={chat.id}
              onClick={() => selectChat(chat.id)}
              type="button"
            >
              <span className="line-clamp-2">{chat.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[620px] flex-col">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold tracking-normal">{activeChat?.title ?? "Workspace chat"}</h1>
          <p className="text-sm text-muted-foreground">Answers are grounded in indexed chunks from the selected workspace.</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length ? (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Ask a question about an indexed knowledge source.
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}
        <form className="border-t p-4" onSubmit={sendMessage}>
          <div className="flex gap-2">
            <textarea
              className="min-h-12 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask your workspace knowledge base..."
              value={input}
            />
            <Button type="submit">Send</Button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            Retry is scaffolded; use send again for now.
          </div>
        </form>
      </section>

      <aside className="border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
        <h2 className="text-sm font-semibold">Sources</h2>
        <div className="mt-3 space-y-3">
          {messages
            .flatMap((message) => message.citations)
            .slice(-8)
            .map((citation) => (
              <div className="rounded-md border bg-background p-3 text-sm" key={citation.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium">{citation.title ?? "Source"}</p>
                  <StatusBadge status={`${Math.round(citation.score * 100)}%`} />
                </div>
                <p className="line-clamp-4 text-muted-foreground">{citation.quote}</p>
                {citation.sourceUrl ? (
                  <a className="mt-2 block truncate text-xs hover:underline" href={citation.sourceUrl} rel="noreferrer" target="_blank">
                    {citation.sourceUrl}
                  </a>
                ) : null}
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[80%] rounded-lg bg-primary px-4 py-3 text-primary-foreground" : "max-w-[86%] rounded-lg border bg-card px-4 py-3"}>
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
            {message.content || "Thinking..."}
          </ReactMarkdown>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            onClick={() => navigator.clipboard.writeText(message.content)}
            size="sm"
            type="button"
            variant={isUser ? "secondary" : "ghost"}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        {message.citations.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.citations.map((citation, index) => (
              <span className="rounded-md bg-muted px-2 py-1 text-xs" key={citation.id}>
                [{index + 1}] {citation.title ?? citation.sourceUrl ?? "Source"}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
