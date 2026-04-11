import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
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
  Typography,
} from "@mui/material";
import { MessageCircleMore, Search } from "lucide-react";
import fallbackAvatar from "../../resources/icons/Avatar.png";

const DEFAULT_LIST_WIDTH = 332;
const MIN_LIST_WIDTH = 260;
const MAX_LIST_WIDTH = 520;
const MIN_CONTENT_WIDTH = 420;

type BrowseMode = "contacts" | "chats";
type MessageConversation = {
  id: string;
  type: "p2p" | "group";
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  chatId?: string;
  userOpenId?: string;
};
type MessageRecord = {
  messageId: string;
  chatId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  messageType: string;
  contentText: string;
  createTime: string;
};

function EmptyState(props: { title: string; description: string }) {
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

function sortConversations(items: MessageConversation[]) {
  return [...items].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

export default function MessagesPage() {
  const [browseMode, setBrowseMode] = useState<BrowseMode>("contacts");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<MessageConversation[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<MessageConversation | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesPageToken, setMessagesPageToken] = useState("");

  const trimmedQuery = deferredQuery.trim();

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

  useEffect(() => {
    let cancelled = false;

    async function loadBrowseItems() {
      setListLoading(true);
      setListError("");

      try {
        const response =
          browseMode === "contacts"
            ? await window.messagesBridge?.listContacts()
            : await window.messagesBridge?.listChats();

        if (cancelled) return;
        setItems(sortConversations(response?.items || []));
      } catch (error) {
        if (cancelled) return;
        setItems([]);
        setListError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadBrowseItems();

    return () => {
      cancelled = true;
    };
  }, [browseMode]);

  const visibleItems = useMemo(() => {
    if (!trimmedQuery) {
      return items;
    }

    const keyword = trimmedQuery.toLocaleLowerCase();
    return items.filter((item) => {
      const title = item.title.toLocaleLowerCase();
      const subtitle = item.subtitle?.toLocaleLowerCase() || "";
      return title.includes(keyword) || subtitle.includes(keyword);
    });
  }, [items, trimmedQuery]);

  const currentConversation = useMemo(() => {
    if (!selectedConversation) return null;
    return {
      ...selectedConversation,
      chatId: selectedConversation.chatId || "",
    };
  }, [selectedConversation]);

  async function loadMessages(conversation: MessageConversation, pageToken?: string) {
    const isLoadMore = !!pageToken;
    setMessagesLoading(true);
    setMessagesError("");

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
      });

      const nextConversation = { ...conversation, chatId };
      setSelectedConversation(nextConversation);
      setMessages((previous) =>
        isLoadMore ? [...previous, ...(response?.items || [])] : response?.items || []
      );
      setHasMoreMessages(!!response?.hasMore);
      setMessagesPageToken(response?.pageToken || "");
    } catch (error) {
      if (!isLoadMore) {
        setMessages([]);
      }
      setHasMoreMessages(false);
      setMessagesPageToken("");
      setMessagesError(error instanceof Error ? error.message : String(error));
    } finally {
      setMessagesLoading(false);
    }
  }

  async function handleSelectConversation(conversation: MessageConversation) {
    setSelectedConversation(conversation);
    setMessages([]);
    setMessagesPageToken("");
    setHasMoreMessages(false);
    await loadMessages(conversation);
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
            placeholder={browseMode === "contacts" ? "筛选联系人" : "筛选会话"}
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
            <Typography variant="caption" color="text.secondary">
              {trimmedQuery
                ? "筛选结果"
                : browseMode === "contacts"
                  ? "联系人列表"
                  : "会话列表"}
            </Typography>
            {!listLoading && items.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {items.length} 项
              </Typography>
            )}
          </Stack>
        </Box>

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
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title={trimmedQuery ? "没有匹配结果" : browseMode === "contacts" ? "暂无联系人" : "暂无会话"}
              description={
                trimmedQuery
                  ? "换个关键词试试，或者切换到另一个列表。"
                  : browseMode === "contacts"
                    ? "当前登录下还没有可见的联系人列表。"
                    : "当前登录下还没有可见的会话列表。"
              }
            />
          ) : (
            <List disablePadding>
              {visibleItems.map((item) => (
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
                          ? item.subtitle || "联系人"
                          : item.subtitle || (item.type === "p2p" ? "私聊会话" : "群聊会话")
                      }
                      primaryTypographyProps={{ noWrap: true, fontWeight: 600 }}
                      secondaryTypographyProps={{ noWrap: true }}
                    />
                  </ListItemButton>
                </Box>
              ))}
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
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={700} noWrap>
                  {currentConversation.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {currentConversation.type === "p2p"
                    ? "私聊消息"
                    : currentConversation.subtitle || "群聊消息"}
                </Typography>
              </Box>
            </Box>

            <Divider />

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "background.default" }}>
              {messagesError ? (
                <Alert severity="error" sx={{ m: 2.5 }}>
                  {messagesError}
                </Alert>
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
                  {hasMoreMessages && (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                      <Button
                        variant="text"
                        onClick={() => void loadMessages(currentConversation, messagesPageToken)}
                        disabled={messagesLoading || !messagesPageToken}
                      >
                        {messagesLoading ? "加载中..." : "加载更多消息"}
                      </Button>
                    </Box>
                  )}

                  {messages.map((message, index) => (
                    <Box
                      key={message.messageId}
                      sx={{
                        px: 2.5,
                        py: 1.75,
                        borderTop: index === 0 ? "1px solid" : "none",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                      }}
                    >
                      <Stack spacing={0.75} sx={{ maxWidth: 920 }}>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                          }}
                        >
                          <Typography variant="body2" fontWeight={600} color="text.primary">
                            {message.senderName || "成员"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {message.createTime || ""}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7 }}
                        >
                          {formatMessageContent(message)}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
