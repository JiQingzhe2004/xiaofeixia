import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AlertTriangle,
  Download,
  LoaderCircle,
  MessageCircleMore,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import fallbackAvatar from "../../resources/icons/Avatar.png";
import appIcon from "../../resources/icons/icon_1024.png";
import { useNotice } from "../components/notice/NoticeCenter";

const DEFAULT_LIST_WIDTH = 332;
const MIN_LIST_WIDTH = 260;
const MAX_LIST_WIDTH = 520;
const MIN_CONTENT_WIDTH = 420;
const LIST_POLL_INTERVAL = 8000;
const CURRENT_CHAT_POLL_INTERVAL = 2500;

type BrowseMode = "contacts" | "chats";
type MessageConversation = {
  id: string;
  type: "p2p" | "group";
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  chatId?: string;
  userOpenId?: string;
  source: "user" | "bot" | "mixed";
  contactCategory?: "directory" | "discovered";
};
type MessageRecord = {
  messageId: string;
  chatId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  senderOpenId?: string;
  senderType?: string;
  isCurrentBot?: boolean;
  isSelf?: boolean;
  messageType: string;
  contentText: string;
  createTime: string;
};
type IncomingRealtimeMessage = {
  eventType: "im.message.receive_v1";
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  contentText: string;
  createTime: string;
  senderOpenId?: string;
};
type RealtimeStatus = {
  state: "disabled" | "connecting" | "connected" | "reconnecting" | "error";
  message: string;
  updatedAt: number;
};
type IncomingConversationChange = {
  eventType: "im.chat.access_event.bot_p2p_chat_entered_v1";
  chatId: string;
  userOpenId: string;
  title?: string;
  avatarUrl?: string;
  lastMessageAt?: number;
};
type ContactSection = {
  key: "directory" | "discovered";
  title: string;
  description: string;
  items: MessageConversation[];
};

function EmptyState(props: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <Stack
      spacing={1}
      alignItems="center"
      justifyContent="center"
      sx={{ flex: 1, px: 4, textAlign: "center", color: "text.secondary" }}
    >
      <Avatar sx={{ width: 48, height: 48, bgcolor: "action.hover", color: "text.secondary" }}>
        <MessageCircleMore size={22} />
      </Avatar>
      <Typography variant="subtitle1" fontWeight={600} color="text.primary">
        {props.title}
      </Typography>
      <Typography variant="body2">{props.description}</Typography>
      {props.action}
    </Stack>
  );
}

function formatMessageContent(message: MessageRecord) {
  const trimmed = message.contentText?.trim();
  if (trimmed) return trimmed;

  const placeholders: Record<string, string> = {
    image: "[图片]",
    file: "[文件]",
    audio: "[语音]",
    media: "[视频]",
    video: "[视频]",
    sticker: "[表情]",
    interactive: "[卡片消息]",
  };

  return placeholders[message.messageType] || "[消息]";
}

function getMessageSenderName(
  message: MessageRecord,
  conversation?: MessageConversation | null
) {
  if (message.isSelf) {
    return "我";
  }

  if (message.senderName) {
    return message.senderName;
  }

  if (conversation?.type === "p2p") {
    return conversation.title;
  }

  return "成员";
}

function getMessageAvatarFallbackText(
  message: MessageRecord,
  conversation?: MessageConversation | null
) {
  const senderName = getMessageSenderName(message, conversation).trim();
  return senderName ? senderName.slice(0, 1).toUpperCase() : "?";
}

function getMessageSenderKey(
  message: MessageRecord,
  conversation?: MessageConversation | null
) {
  if (message.messageType === "system" && !message.senderOpenId && !message.senderName) {
    return "system";
  }

  if (message.isSelf) {
    return "self";
  }

  if (message.senderOpenId) {
    return `open:${message.senderOpenId}`;
  }

  if (conversation?.type === "p2p" && conversation.userOpenId) {
    return `p2p:${conversation.userOpenId}`;
  }

  if (message.senderName) {
    return `name:${message.senderName}`;
  }

  return `message:${message.messageId}`;
}

function hasSameMessageSender(
  left: MessageRecord | undefined,
  right: MessageRecord | undefined,
  conversation?: MessageConversation | null
) {
  if (!left || !right) {
    return false;
  }

  return (
    left.isSelf === right.isSelf &&
    getMessageSenderKey(left, conversation) === getMessageSenderKey(right, conversation)
  );
}

function sortConversations(items: MessageConversation[]) {
  return [...items].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

function orderConversations(items: MessageConversation[], mode: BrowseMode) {
  return mode === "contacts" ? sortConversations(items) : [...items];
}

function areConversationListsEqual(
  current: MessageConversation[],
  next: MessageConversation[]
) {
  if (current.length !== next.length) return false;

  return current.every((item, index) => {
    const target = next[index];
    return (
      item.id === target.id &&
      item.type === target.type &&
      item.title === target.title &&
      item.subtitle === target.subtitle &&
      item.avatarUrl === target.avatarUrl &&
      item.chatId === target.chatId &&
      item.userOpenId === target.userOpenId &&
      item.source === target.source &&
      item.contactCategory === target.contactCategory
    );
  });
}

function mergeConversationSource(
  left: MessageConversation["source"],
  right: MessageConversation["source"]
): MessageConversation["source"] {
  if (left === right) return left;
  return "mixed";
}

function getConversationIdentity(conversation: MessageConversation) {
  if (conversation.source === "bot") {
    return "bot";
  }
  return "user";
}

function getConversationSourceMeta(conversation: MessageConversation) {
  if (conversation.source === "mixed") {
    return {
      label: "用户+Bot",
      color: "secondary" as const,
      subtitle:
        conversation.type === "p2p" ? "用户与机器人均可见" : "用户会话，含 Bot 补充",
    };
  }

  if (conversation.source === "bot") {
    return {
      label: "Bot",
      color: "info" as const,
      subtitle: conversation.type === "p2p" ? "机器人补充会话" : "机器人所在群聊",
    };
  }

  return {
    label: "用户",
    color: "default" as const,
    subtitle: conversation.type === "p2p" ? "私聊会话" : "群聊会话",
  };
}

function buildContactSections(items: MessageConversation[]): ContactSection[] {
  const directoryItems = items.filter((item) => item.contactCategory !== "discovered");
  const discoveredItems = items.filter((item) => item.contactCategory === "discovered");
  const sections: ContactSection[] = [];

  if (directoryItems.length > 0) {
    sections.push({
      key: "directory",
      title: "官方通讯录",
      description: "来自飞书通讯录接口和用户搜索。",
      items: directoryItems,
    });
  }

  if (discoveredItems.length > 0) {
    sections.push({
      key: "discovered",
      title: "会话发现",
      description: "只包含已经在私聊、最近消息或机器人会话里出现过的人。",
      items: discoveredItems,
    });
  }

  return sections;
}

function areMessageListsEqual(current: MessageRecord[], next: MessageRecord[]) {
  if (current.length !== next.length) return false;

  return current.every((item, index) => {
    const target = next[index];
    return (
      item.messageId === target.messageId &&
      item.chatId === target.chatId &&
      item.senderName === target.senderName &&
      item.senderAvatarUrl === target.senderAvatarUrl &&
      item.senderOpenId === target.senderOpenId &&
      item.isSelf === target.isSelf &&
      item.messageType === target.messageType &&
      item.contentText === target.contentText &&
      item.createTime === target.createTime
    );
  });
}

function matchesRealtimeConversation(
  conversation: MessageConversation,
  payload: IncomingRealtimeMessage
) {
  return (
    (!!conversation.chatId && conversation.chatId === payload.chatId) ||
    (conversation.type === "p2p" &&
      !!conversation.userOpenId &&
      conversation.userOpenId === payload.senderOpenId)
  );
}

function promoteConversationWithRealtimeMessage(
  items: MessageConversation[],
  payload: IncomingRealtimeMessage
) {
  const matchedIndex = items.findIndex((item) => matchesRealtimeConversation(item, payload));
  if (matchedIndex < 0) {
    return items;
  }

  const matchedItem = items[matchedIndex];
  const nextItems = [...items];
  nextItems.splice(matchedIndex, 1);
  nextItems.unshift({
    ...matchedItem,
    chatId: matchedItem.chatId || payload.chatId,
    subtitle: payload.contentText || matchedItem.subtitle,
  });
  return nextItems;
}

function upsertConversationItem(
  items: MessageConversation[],
  item: MessageConversation
) {
  const existingIndex = items.findIndex(
    (current) => current.id === item.id || (!!item.chatId && current.chatId === item.chatId)
  );

  if (existingIndex < 0) {
    return [item, ...items];
  }

  const nextItems = [...items];
  const currentItem = nextItems[existingIndex];
  nextItems.splice(existingIndex, 1);
  nextItems.unshift({
    ...currentItem,
    ...item,
    subtitle: item.subtitle || currentItem.subtitle,
    source: mergeConversationSource(currentItem.source, item.source),
    contactCategory:
      currentItem.contactCategory === "directory" || item.contactCategory === "directory"
        ? "directory"
        : currentItem.contactCategory || item.contactCategory,
  });
  return nextItems;
}

function isNearBottom(element: HTMLDivElement | null, threshold = 96) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

function isNearTop(element: HTMLDivElement | null, threshold = 48) {
  if (!element) return false;
  return element.scrollTop <= threshold;
}

function scrollToBottom(element: HTMLDivElement | null) {
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

function RealtimeStatusIndicator(props: { status: RealtimeStatus }) {
  const iconProps = { size: 16, strokeWidth: 2.2 };
  const tooltipTitle = `${props.status.message}，轮询兜底已开启`;

  if (props.status.state === "connected") {
    return (
      <Tooltip title={tooltipTitle}>
        <Box sx={{ display: "inline-flex", color: "success.main" }}>
          <Wifi {...iconProps} />
        </Box>
      </Tooltip>
    );
  }

  if (props.status.state === "connecting" || props.status.state === "reconnecting") {
    return (
      <Tooltip title={tooltipTitle}>
        <Box
          sx={{
            display: "inline-flex",
            color: "warning.main",
            "@keyframes spinRealtime": {
              from: { transform: "rotate(0deg)" },
              to: { transform: "rotate(360deg)" },
            },
            animation: "spinRealtime 1s linear infinite",
          }}
        >
          <LoaderCircle {...iconProps} />
        </Box>
      </Tooltip>
    );
  }

  if (props.status.state === "error") {
    return (
      <Tooltip title={tooltipTitle}>
        <Box sx={{ display: "inline-flex", color: "error.main" }}>
          <AlertTriangle {...iconProps} />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltipTitle}>
      <Box sx={{ display: "inline-flex", color: "text.disabled" }}>
        <WifiOff {...iconProps} />
      </Box>
    </Tooltip>
  );
}

export default function MessagesPage() {
  const { pushNotice } = useNotice();
  const [browseMode, setBrowseMode] = useState<BrowseMode>("contacts");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const browseModeRef = useRef<BrowseMode>("contacts");
  const browseQueryRef = useRef("");
  const chatPreviewCacheRef = useRef<Record<string, string>>({});
  const chatPreviewHydrationSeqRef = useRef(0);
  const currentTopMessageIdRef = useRef("");
  const messagesRef = useRef<MessageRecord[]>([]);
  const pendingMessageViewportActionRef = useRef<
    | { type: "bottom" }
    | { type: "preserve"; previousScrollHeight: number; previousScrollTop: number }
    | null
  >(null);
  const selectedConversationRef = useRef<MessageConversation | null>(null);
  const browseLoadSeqRef = useRef(0);
  const messagePollBusyRef = useRef(false);
  const messageLoadMoreBusyRef = useRef(false);
  const listPollBusyRef = useRef(false);
  const browseRefreshTimerRef = useRef<number | null>(null);
  const messageRefreshTimerRef = useRef<number | null>(null);
  const [items, setItems] = useState<MessageConversation[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<MessageConversation | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [messageHint, setMessageHint] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [exportingChatLab, setExportingChatLab] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>({
    state: "disabled",
    message: "实时连接未启用",
    updatedAt: Date.now(),
  });
  const [p2pUnavailableMap, setP2pUnavailableMap] = useState<Record<string, boolean>>({});
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesPageToken, setMessagesPageToken] = useState("");

  const trimmedQuery = deferredQuery.trim();

  useEffect(() => {
    browseModeRef.current = browseMode;
  }, [browseMode]);

  useEffect(() => {
    browseQueryRef.current = trimmedQuery;
  }, [trimmedQuery]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    currentTopMessageIdRef.current = messages[0]?.messageId || "";
    messagesRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    const viewport = messageViewportRef.current;
    const action = pendingMessageViewportActionRef.current;
    if (!viewport || !action) {
      return;
    }

    if (action.type === "bottom") {
      scrollToBottom(viewport);
    } else {
      const heightDelta = viewport.scrollHeight - action.previousScrollHeight;
      viewport.scrollTop = action.previousScrollTop + heightDelta;
    }

    pendingMessageViewportActionRef.current = null;
  }, [messages]);

  function updateChatPreviewCache(chatId: string | undefined, preview: string) {
    if (!chatId) {
      return false;
    }

    if (chatPreviewCacheRef.current[chatId] === preview) {
      return false;
    }

    chatPreviewCacheRef.current[chatId] = preview;
    return true;
  }

  function applyCachedChatPreviews(list: MessageConversation[], mode: BrowseMode) {
    if (mode !== "chats") {
      return list;
    }

    return list.map((item) => {
      const cachedPreview = item.chatId ? chatPreviewCacheRef.current[item.chatId] : "";
      if (!cachedPreview || item.subtitle === cachedPreview) {
        return item;
      }

      return {
        ...item,
        subtitle: cachedPreview,
      };
    });
  }

  async function hydrateChatPreviewSummaries(
    list: MessageConversation[],
    mode: BrowseMode,
    searchQuery: string
  ) {
    if (mode !== "chats") {
      return;
    }

    const targetItems = list.filter((item) => item.type === "group" && item.chatId);
    if (targetItems.length === 0) {
      return;
    }

    const hydrationSeq = ++chatPreviewHydrationSeqRef.current;
    const batchSize = 6;

    for (let index = 0; index < targetItems.length; index += batchSize) {
      const batch = targetItems.slice(index, index + batchSize);
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const response = await window.messagesBridge?.listChatMessages({
              chatId: item.chatId!,
              pageSize: 1,
              sort: "desc",
              identity: getConversationIdentity(item),
            });
            const preview = response?.items?.[0] ? formatMessageContent(response.items[0]) : "";
            return {
              chatId: item.chatId!,
              preview,
            };
          } catch {
            return null;
          }
        })
      );

      if (
        hydrationSeq !== chatPreviewHydrationSeqRef.current ||
        browseModeRef.current !== mode ||
        browseQueryRef.current !== searchQuery
      ) {
        return;
      }

      let hasCacheUpdate = false;
      results.forEach((result) => {
        if (result && updateChatPreviewCache(result.chatId, result.preview)) {
          hasCacheUpdate = true;
        }
      });

      if (!hasCacheUpdate) {
        continue;
      }

      setItems((current) =>
        current.map((item) => {
          const cachedPreview = item.chatId ? chatPreviewCacheRef.current[item.chatId] : "";
          if (!cachedPreview || item.subtitle === cachedPreview) {
            return item;
          }

          return {
            ...item,
            subtitle: cachedPreview,
          };
        })
      );
    }
  }

  useEffect(() => {
    return () => {
      if (browseRefreshTimerRef.current) {
        window.clearTimeout(browseRefreshTimerRef.current);
      }
      if (messageRefreshTimerRef.current) {
        window.clearTimeout(messageRefreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function clampListWidth(clientX: number) {
      const container = containerRef.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const maxAllowed = Math.max(
        MIN_LIST_WIDTH,
        Math.min(MAX_LIST_WIDTH, bounds.width - MIN_CONTENT_WIDTH)
      );
      const nextWidth = clientX - bounds.left;
      setListWidth(Math.min(maxAllowed, Math.max(MIN_LIST_WIDTH, nextWidth)));
    }

    function handlePointerMove(event: PointerEvent) {
      clampListWidth(event.clientX);
    }

    function handlePointerUp() {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  async function refreshBrowseItems(
    mode: BrowseMode = browseModeRef.current,
    options?: { quiet?: boolean; promotePayload?: IncomingRealtimeMessage; query?: string }
  ) {
    const quiet = !!options?.quiet;
    const searchQuery = options?.query ?? browseQueryRef.current;
    const loadSeq = ++browseLoadSeqRef.current;

    if (!quiet) {
      setListLoading(true);
      setListError("");
    }

    try {
      const response =
        searchQuery.length > 0
          ? mode === "contacts"
            ? await window.messagesBridge?.searchUsers(searchQuery)
            : await window.messagesBridge?.searchChats(searchQuery)
          : mode === "contacts"
            ? await window.messagesBridge?.listContacts()
            : await window.messagesBridge?.listChats();

      if (loadSeq !== browseLoadSeqRef.current) {
        return;
      }

      const nextItems = options?.promotePayload
        ? promoteConversationWithRealtimeMessage(
            applyCachedChatPreviews(orderConversations(response?.items || [], mode), mode),
            options.promotePayload
          )
        : applyCachedChatPreviews(orderConversations(response?.items || [], mode), mode);

      setItems((current) => (areConversationListsEqual(current, nextItems) ? current : nextItems));
      void hydrateChatPreviewSummaries(nextItems, mode, searchQuery);
      if (!quiet) {
        setListError("");
      }
    } catch (error) {
      if (loadSeq !== browseLoadSeqRef.current || quiet) {
        return;
      }
      setItems([]);
      setListError(error instanceof Error ? error.message : String(error));
    } finally {
      if (loadSeq === browseLoadSeqRef.current && !quiet) {
        setListLoading(false);
      }
    }
  }

  function scheduleBrowseRefresh(payload?: IncomingRealtimeMessage) {
    if (browseRefreshTimerRef.current) {
      window.clearTimeout(browseRefreshTimerRef.current);
    }
    browseRefreshTimerRef.current = window.setTimeout(() => {
      void refreshBrowseItems(browseModeRef.current, {
        quiet: true,
        promotePayload: payload,
        query: browseQueryRef.current,
      });
    }, 280);
  }

  function scheduleMessageRefresh(conversation: MessageConversation) {
    if (messageRefreshTimerRef.current) {
      window.clearTimeout(messageRefreshTimerRef.current);
    }
    messageRefreshTimerRef.current = window.setTimeout(() => {
      void loadMessages(conversation, undefined, { quiet: true });
    }, 320);
  }

  useEffect(() => {
    void refreshBrowseItems(browseMode, { query: trimmedQuery });
  }, [browseMode, trimmedQuery]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || listPollBusyRef.current) {
        return;
      }

      listPollBusyRef.current = true;
      void refreshBrowseItems(browseModeRef.current, {
        quiet: true,
        query: browseQueryRef.current,
      })
        .catch(() => undefined)
        .finally(() => {
          listPollBusyRef.current = false;
        });
    }, LIST_POLL_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const currentConversation = selectedConversationRef.current;
      if (
        !currentConversation ||
        document.visibilityState !== "visible" ||
        messagePollBusyRef.current
      ) {
        return;
      }

      messagePollBusyRef.current = true;
      void loadMessages(currentConversation, undefined, { quiet: true })
        .catch(() => undefined)
        .finally(() => {
          messagePollBusyRef.current = false;
        });
    }, CURRENT_CHAT_POLL_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const statusPromise = window.messagesBridge?.getRealtimeStatus();
    void statusPromise?.then((status) => {
      if (status) {
        setRealtimeStatus(status);
      }
    });

    const unsubscribeIncoming = window.messagesBridge?.onIncomingMessage((payload) => {
      updateChatPreviewCache(payload.chatId, payload.contentText);
      setItems((current) => promoteConversationWithRealtimeMessage(current, payload));
      scheduleBrowseRefresh(payload);

      const currentConversation = selectedConversationRef.current;
      if (!currentConversation || !matchesRealtimeConversation(currentConversation, payload)) {
        return;
      }

      const nextConversation = {
        ...currentConversation,
        chatId: currentConversation.chatId || payload.chatId,
      };

      setSelectedConversation((current) => {
        if (
          current &&
          current.id === nextConversation.id &&
          current.chatId === nextConversation.chatId &&
          current.title === nextConversation.title &&
          current.subtitle === nextConversation.subtitle &&
          current.avatarUrl === nextConversation.avatarUrl &&
          current.userOpenId === nextConversation.userOpenId
        ) {
          return current;
        }
        return nextConversation;
      });
      setP2pUnavailableMap((current) => {
        if (!current[currentConversation.id]) return current;
        const next = { ...current };
        delete next[currentConversation.id];
        return next;
      });
      setMessageHint(null);
      setMessagesError("");
      setMessages((current) => {
        if (current.some((message) => message.messageId === payload.messageId)) {
          return current;
        }

        if (isNearBottom(messageViewportRef.current) || current.length === 0) {
          pendingMessageViewportActionRef.current = { type: "bottom" };
        }

        return [
          {
            messageId: payload.messageId,
            chatId: payload.chatId,
            senderName: currentConversation.type === "p2p" ? currentConversation.title : undefined,
            senderAvatarUrl:
              currentConversation.type === "p2p" ? currentConversation.avatarUrl : undefined,
            senderOpenId: payload.senderOpenId,
            isSelf: false,
            messageType: payload.messageType,
            contentText: payload.contentText,
            createTime: payload.createTime,
          },
          ...current,
        ];
      });
      scheduleMessageRefresh(nextConversation);
    });

    const unsubscribeConversationChanged = window.messagesBridge?.onConversationChanged((payload) => {
      const nextConversation: MessageConversation = {
        id: `user:${payload.userOpenId}`,
        type: "p2p",
        title: payload.title || payload.userOpenId,
        subtitle: "机器人私聊会话",
        avatarUrl: payload.avatarUrl,
        chatId: payload.chatId,
        userOpenId: payload.userOpenId,
        source: "bot",
        contactCategory: "discovered",
      };

      if (browseModeRef.current === "contacts" && !browseQueryRef.current) {
        setItems((current) => upsertConversationItem(current, nextConversation));
      }
      scheduleBrowseRefresh();

      const currentConversation = selectedConversationRef.current;
      if (!currentConversation || currentConversation.chatId !== payload.chatId) {
        return;
      }

      scheduleMessageRefresh({
        ...currentConversation,
        chatId: payload.chatId,
      });
    });

    const unsubscribeStatus = window.messagesBridge?.onRealtimeStatusChange((status) => {
      setRealtimeStatus(status);
    });

    return () => {
      unsubscribeIncoming?.();
      unsubscribeConversationChanged?.();
      unsubscribeStatus?.();
    };
  }, []);

  const currentConversation = useMemo(() => {
    if (!selectedConversation) return null;
    return {
      ...selectedConversation,
      chatId: selectedConversation.chatId || "",
    };
  }, [selectedConversation]);

  const renderedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const contactSections = useMemo(() => {
    if (browseMode !== "contacts") {
      return [] as ContactSection[];
    }
    return buildContactSections(items);
  }, [browseMode, items]);

  function tryLoadOlderMessages() {
    if (
      !currentConversation ||
      !messagesPageToken ||
      !hasMoreMessages ||
      messagesLoading ||
      messageLoadMoreBusyRef.current ||
      !isNearTop(messageViewportRef.current)
    ) {
      return;
    }

    messageLoadMoreBusyRef.current = true;
    void loadMessages(currentConversation, messagesPageToken);
  }

  async function loadMessages(
    conversation: MessageConversation,
    pageToken?: string,
    options?: { quiet?: boolean }
  ) {
    const isLoadMore = !!pageToken;
    const quiet = !!options?.quiet && !isLoadMore;
    const previousMessages = messagesRef.current;

    if (!quiet) {
      setMessagesLoading(true);
      setMessagesError("");
    }
    if (!isLoadMore && !quiet) {
      setMessageHint(null);
    }

    try {
      let chatId = conversation.chatId || "";

      if (conversation.type === "p2p" && !chatId) {
        if (!conversation.userOpenId) {
          throw new Error("缺少联系人 open_id，无法解析私聊会话。");
        }
        const resolved = await window.messagesBridge?.resolveP2PChat(conversation.userOpenId);
        chatId = resolved?.chatId || "";
      }

      if (!chatId) {
        throw new Error("未找到可用的会话 ID。");
      }

      const response = await window.messagesBridge?.listChatMessages({
        chatId,
        pageToken,
        pageSize: 30,
        sort: "desc",
        identity: getConversationIdentity(conversation),
      });

      const nextConversation = { ...conversation, chatId };
      const isStillCurrent =
        !selectedConversationRef.current ||
        selectedConversationRef.current.id === conversation.id;
      if (!isStillCurrent) {
        return;
      }

      setSelectedConversation(nextConversation);
      setP2pUnavailableMap((current) => {
        if (!current[conversation.id]) return current;
        const next = { ...current };
        delete next[conversation.id];
        return next;
      });
      const latestMessageId = response?.items?.[0]?.messageId || "";
      const latestPreview = response?.items?.[0] ? formatMessageContent(response.items[0]) : "";
      updateChatPreviewCache(chatId, latestPreview);
      const shouldPromoteInChatList =
        quiet &&
        !isLoadMore &&
        browseModeRef.current === "chats" &&
        !browseQueryRef.current &&
        !!latestMessageId &&
        latestMessageId !== currentTopMessageIdRef.current;

      setItems((current) => {
        const itemIndex = current.findIndex((item) => item.id === conversation.id);
        if (itemIndex < 0) {
          return current;
        }

        const nextItems = [...current];
        const currentItem = nextItems[itemIndex];
        const updatedItem = {
          ...currentItem,
          chatId,
          subtitle: latestPreview || currentItem.subtitle,
        };

        if (shouldPromoteInChatList) {
          nextItems.splice(itemIndex, 1);
          nextItems.unshift(updatedItem);
          return nextItems;
        }

        nextItems[itemIndex] = updatedItem;
        return nextItems;
      });
      const nextMessages = isLoadMore ? [...previousMessages, ...(response?.items || [])] : response?.items || [];
      const messagesChanged = !areMessageListsEqual(previousMessages, nextMessages);

      if (messagesChanged) {
        if (isLoadMore) {
          const viewport = messageViewportRef.current;
          pendingMessageViewportActionRef.current = viewport
            ? {
                type: "preserve",
                previousScrollHeight: viewport.scrollHeight,
                previousScrollTop: viewport.scrollTop,
              }
            : null;
        } else if (!quiet || isNearBottom(messageViewportRef.current)) {
          pendingMessageViewportActionRef.current = { type: "bottom" };
        }
      } else if (!isLoadMore && !quiet) {
        pendingMessageViewportActionRef.current = { type: "bottom" };
      }

      setMessages(messagesChanged ? nextMessages : previousMessages);
      setHasMoreMessages(!!response?.hasMore);
      setMessagesPageToken(response?.pageToken || "");
    } catch (error) {
      if (!isLoadMore) {
        setMessages([]);
      }
      setHasMoreMessages(false);
      setMessagesPageToken("");
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("尚未建立私聊会话")) {
        if (!quiet) {
          setMessagesError("");
        }
        setMessageHint({
          title: "暂未建立私聊会话",
          description:
            "这个联系人当前还没有可读取的私聊记录。先在飞书里和对方发起一次聊天，之后这里就能正常显示消息。",
        });
        setP2pUnavailableMap((current) => ({
          ...current,
          [conversation.id]: true,
        }));
      } else {
        if (!quiet) {
          setMessagesError(message);
          setMessageHint(null);
        }
      }
    } finally {
      if (isLoadMore) {
        messageLoadMoreBusyRef.current = false;
      }
      if (!quiet) {
        setMessagesLoading(false);
      }
    }
  }

  async function handleSelectConversation(conversation: MessageConversation) {
    setSelectedConversation(conversation);
    setMessages([]);
    setMessagesPageToken("");
    setHasMoreMessages(false);
    await loadMessages(conversation);
  }

  async function handleExportChatLab() {
    if (!currentConversation || exportingChatLab) {
      return;
    }

    setExportingChatLab(true);
    try {
      const result = await window.messagesBridge?.exportChatLab(currentConversation);
      if (!result || result.canceled) {
        return;
      }

      pushNotice(
        `已导出 ${result.messageCount || 0} 条消息到 ${result.fileName || "ChatLab 文件"}`,
        {
          severity: "success",
          duration: 4200,
        }
      );
    } catch (error) {
      pushNotice(error instanceof Error ? error.message : String(error), {
        severity: "error",
        duration: 4200,
      });
    } finally {
      setExportingChatLab(false);
    }
  }

  function renderBrowseListItem(item: MessageConversation) {
    return (
      <Box key={item.id}>
        <ListItemButton
          onClick={() => void handleSelectConversation(item)}
          selected={selectedConversation?.id === item.id}
          sx={{
            px: 1.25,
            py: 1.1,
            borderRadius: 1.75,
            mb: 0.5,
          }}
        >
          <ListItemAvatar>
            <Avatar src={item.avatarUrl || fallbackAvatar} alt={item.title} />
          </ListItemAvatar>
          <ListItemText
            primary={item.title}
            secondary={
              browseMode === "contacts"
                ? p2pUnavailableMap[item.id]
                  ? "尚未建立私聊会话"
                  : item.subtitle || (item.contactCategory === "discovered" ? "会话发现" : "联系人")
                : item.subtitle || " "
            }
            primaryTypographyProps={{ noWrap: true, fontWeight: 600 }}
            secondaryTypographyProps={{ noWrap: true }}
          />
          {browseMode === "contacts" && item.contactCategory === "discovered" ? (
            <Chip
              size="small"
              label="会话发现"
              color="warning"
              variant="outlined"
              sx={{ ml: 1 }}
            />
          ) : null}
          {browseMode === "chats" && item.source !== "user" && (
            <Chip
              size="small"
              label={getConversationSourceMeta(item).label}
              color={getConversationSourceMeta(item).color}
              variant="filled"
              sx={{ ml: 1 }}
            />
          )}
        </ListItemButton>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        minHeight: 0,
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          width: listWidth,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Tabs
            value={browseMode}
            onChange={(_event, value: BrowseMode) => setBrowseMode(value)}
            variant="fullWidth"
            sx={{ minHeight: 40 }}
          >
            <Tab label="联系人" value="contacts" sx={{ minHeight: 40 }} />
            <Tab label="会话" value="chats" sx={{ minHeight: 40 }} />
          </Tabs>

          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={browseMode === "contacts" ? "搜索联系人" : "搜索会话"}
            sx={{ mt: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Divider />

        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {trimmedQuery
                  ? "搜索结果"
                  : browseMode === "contacts"
                    ? "联系人列表"
                    : "会话列表"}
              </Typography>
              <RealtimeStatusIndicator status={realtimeStatus} />
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center">
              {!listLoading && items.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {items.length} 项
                </Typography>
              )}
            </Stack>
          </Stack>
        </Box>

        {browseMode === "contacts" && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              这里只展示官方通讯录，以及已经在私聊或机器人会话里出现过的人。外部联系人不会自动全量列出。
            </Typography>
          </Box>
        )}

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1, pb: 1 }}>
          {listLoading ? (
            <Stack spacing={1} sx={{ p: 1 }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" height={56} />
              ))}
            </Stack>
          ) : listError ? (
            <Alert severity="error" sx={{ m: 1 }}>
              {listError}
            </Alert>
          ) : items.length === 0 ? (
            <EmptyState
              title={trimmedQuery ? "没有匹配结果" : browseMode === "contacts" ? "暂无联系人" : "暂无会话"}
              description={
                trimmedQuery
                  ? browseMode === "contacts"
                    ? "这个关键词没有命中当前可见的通讯录，也没有命中已发现的会话联系人。"
                    : "换个关键词试试，或者切换到另一个列表。"
                  : browseMode === "contacts"
                    ? "当前登录下还没有可见的官方通讯录，也还没有从会话里发现联系人。"
                    : "当前登录下还没有可见的会话列表。"
              }
            />
          ) : browseMode === "contacts" ? (
            <List disablePadding>
              {contactSections.map((section) => (
                <Box key={section.key} sx={{ mb: 1.25 }}>
                  <Box sx={{ px: 1.25, pt: 0.75, pb: 0.9 }}>
                    <Typography variant="caption" fontWeight={700} color="text.primary">
                      {section.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.25 }}
                    >
                      {section.description}
                    </Typography>
                  </Box>
                  {section.items.map((item) => renderBrowseListItem(item))}
                </Box>
              ))}
            </List>
          ) : (
            <List disablePadding>
              {items.map((item) => renderBrowseListItem(item))}
            </List>
          )}
        </Box>
      </Box>

      <Box
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
          const container = containerRef.current;
          if (!container) return;
          const bounds = container.getBoundingClientRect();
          const maxAllowed = Math.max(
            MIN_LIST_WIDTH,
            Math.min(MAX_LIST_WIDTH, bounds.width - MIN_CONTENT_WIDTH)
          );
          const nextWidth = event.clientX - bounds.left;
          setListWidth(Math.min(maxAllowed, Math.max(MIN_LIST_WIDTH, nextWidth)));
        }}
        sx={{
          width: 8,
          flexShrink: 0,
          cursor: "col-resize",
          position: "relative",
          bgcolor: isResizing ? "action.hover" : "transparent",
          transition: "background-color 160ms ease",
          touchAction: "none",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: "1px",
            transform: "translateX(-50%)",
            bgcolor: "divider",
          },
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
      />

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        {!currentConversation ? (
          <EmptyState title="选择一个会话" description="从左侧联系人或会话列表里选择一项，然后查看消息内容。" />
        ) : (
          <>
            <Box
              sx={{
                px: 2.5,
                py: 1.75,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                bgcolor: "background.paper",
              }}
            >
              <Avatar
                src={currentConversation.avatarUrl || fallbackAvatar}
                alt={currentConversation.title}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} noWrap>
                  {currentConversation.title}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {currentConversation.source === "user"
                      ? currentConversation.type === "p2p"
                        ? "私聊消息"
                        : "群聊消息"
                      : currentConversation.subtitle || getConversationSourceMeta(currentConversation).subtitle}
                  </Typography>
                  {currentConversation.source !== "user" && (
                    <Chip
                      size="small"
                      label={getConversationSourceMeta(currentConversation).label}
                      color={getConversationSourceMeta(currentConversation).color}
                      variant="filled"
                    />
                  )}
                </Stack>
              </Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={exportingChatLab ? <LoaderCircle size={14} /> : <Download size={14} />}
                onClick={() => void handleExportChatLab()}
                disabled={exportingChatLab}
                sx={{ borderRadius: 999, textTransform: "none", flexShrink: 0 }}
              >
                {exportingChatLab ? "导出中..." : "导出 ChatLab"}
              </Button>
            </Box>

            <Divider />

            <Box
              ref={messageViewportRef}
              onScroll={tryLoadOlderMessages}
              sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "background.default" }}
            >
              {messagesError ? (
                <Alert severity="error" sx={{ m: 2.5 }}>
                  {messagesError}
                </Alert>
              ) : messageHint ? (
                <Box sx={{ height: "100%", display: "flex" }}>
                  <EmptyState
                    title={messageHint.title}
                    description={messageHint.description}
                    action={
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => void loadMessages(currentConversation)}
                        sx={{ mt: 1, textTransform: "none", borderRadius: 999 }}
                      >
                        重新检测
                      </Button>
                    }
                  />
                </Box>
              ) : messagesLoading && messages.length === 0 ? (
                <Stack spacing={1.5} sx={{ p: 2.5 }}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} variant="rounded" height={84} />
                  ))}
                </Stack>
              ) : messages.length === 0 ? (
                <EmptyState title="暂无消息" description="这个会话里还没有可显示的消息内容。" />
              ) : (
                <Box>
                  {(hasMoreMessages || (messagesLoading && messages.length > 0)) && (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {messagesLoading ? "加载更早消息中..." : "上滑查看更早消息"}
                      </Typography>
                    </Box>
                  )}

                  {renderedMessages.map((message, index) => {
                    const previousMessage = renderedMessages[index - 1];
                    const nextMessage = renderedMessages[index + 1];
                    const groupedWithPrevious = hasSameMessageSender(
                      previousMessage,
                      message,
                      currentConversation
                    );
                    const groupedWithNext = hasSameMessageSender(
                      message,
                      nextMessage,
                      currentConversation
                    );
                    const senderName = getMessageSenderName(message, currentConversation);
                    const avatarSrc =
                      message.senderAvatarUrl ||
                      (message.isCurrentBot ? appIcon : undefined) ||
                      (currentConversation.type === "p2p"
                        ? currentConversation.avatarUrl
                        : undefined);
                    const avatarSlot = groupedWithNext ? (
                      <Box sx={{ width: 32, height: 32, flexShrink: 0 }} />
                    ) : (
                      <Avatar
                        src={avatarSrc}
                        alt={senderName}
                        sx={{ width: 32, height: 32, flexShrink: 0 }}
                      >
                        {!avatarSrc ? getMessageAvatarFallbackText(message, currentConversation) : null}
                      </Avatar>
                    );

                    return (
                      <Box
                        key={message.messageId}
                        sx={{
                          px: 2.5,
                          pt: index === 0 ? 2 : groupedWithPrevious ? 0.35 : 1.4,
                          pb: groupedWithNext ? 0.15 : 0.45,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          justifyContent={message.isSelf ? "flex-end" : "flex-start"}
                          alignItems="flex-end"
                        >
                          {!message.isSelf ? avatarSlot : null}
                          <Stack
                            spacing={groupedWithPrevious ? 0 : 0.5}
                            sx={{
                              width: "100%",
                              maxWidth: 920,
                              alignItems: message.isSelf ? "flex-end" : "flex-start",
                            }}
                          >
                            {!groupedWithPrevious ? (
                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                justifyContent={message.isSelf ? "flex-end" : "flex-start"}
                                sx={{ width: "100%" }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {senderName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {message.createTime || ""}
                                </Typography>
                              </Stack>
                            ) : null}
                            <Box
                              sx={{
                                maxWidth: "72%",
                                px: 1.5,
                                py: 1.125,
                                borderRadius: 2.5,
                                borderTopLeftRadius:
                                  !message.isSelf && groupedWithPrevious ? 1 : 2.5,
                                borderTopRightRadius:
                                  message.isSelf && groupedWithPrevious ? 1 : 2.5,
                                borderBottomLeftRadius:
                                  !message.isSelf && groupedWithNext ? 1 : 2.5,
                                borderBottomRightRadius:
                                  message.isSelf && groupedWithNext ? 1 : 2.5,
                                bgcolor: message.isSelf ? "primary.main" : "background.paper",
                                color: message.isSelf ? "primary.contrastText" : "text.primary",
                                border: message.isSelf ? "none" : "1px solid",
                                borderColor: message.isSelf ? "transparent" : "divider",
                                boxShadow: message.isSelf
                                  ? "0 8px 20px rgba(25, 118, 210, 0.2)"
                                  : "0 6px 18px rgba(15, 23, 42, 0.04)",
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  lineHeight: 1.7,
                                }}
                              >
                                {formatMessageContent(message)}
                              </Typography>
                            </Box>
                          </Stack>
                          {message.isSelf ? avatarSlot : null}
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
