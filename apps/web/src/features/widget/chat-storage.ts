// The visitor's chats on this website, kept in the browser (the chat window's storage is kept
// per website, so each business's site has its own list). Storage can be blocked (private
// windows, strict browsers): then chats simply aren't remembered.

export interface StoredChat {
  chatId: string;
  token: string;
  title: string | null;
  startedAt: string;
  lastAt: string;
}

const MAX_CHATS = 25;
const listKey = (publicId: string) => `vesper:${publicId}:chats`;
const currentKey = (publicId: string) => `vesper:${publicId}:current`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered: fine.
  }
}

export function storedChats(publicId: string): StoredChat[] {
  return read<StoredChat[]>(listKey(publicId), []);
}

export function rememberChat(publicId: string, chat: StoredChat) {
  const others = storedChats(publicId).filter((c) => c.chatId !== chat.chatId);
  write(listKey(publicId), [chat, ...others].slice(0, MAX_CHATS));
  write(currentKey(publicId), chat.chatId);
}

export function forgetChat(publicId: string, chatId: string) {
  write(
    listKey(publicId),
    storedChats(publicId).filter((c) => c.chatId !== chatId),
  );
  if (read<string | null>(currentKey(publicId), null) === chatId) write(currentKey(publicId), null);
}

export function currentChat(publicId: string): StoredChat | null {
  const id = read<string | null>(currentKey(publicId), null);
  return storedChats(publicId).find((c) => c.chatId === id) ?? null;
}

export function clearCurrent(publicId: string) {
  write(currentKey(publicId), null);
}
