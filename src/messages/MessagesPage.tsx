import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { MessageCircleMore, Search } from "lucide-react";
import fallbackAvatar from "../../resources/icons/Avatar.png";

type SearchMode = "users" | "chats";
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

export default function MessagesPage() {
  const [searchMode, setSearchMode] = useState<SearchMode>("users");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<MessageConversation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<MessageConversation | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesPageToken, setMessagesPageToken] = useState("");

  const trimmedQuery = deferredQuery.trim();

  useEffect(() => {
    let cancelled = false;

    async function runSearch() {
      if (!trimmedQuery) {
        setResults([]);
        setSearchError("");
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      setSearchError("");

      try {
        const response =
          searchMode === "users"
            ? await window.messagesBridge?.searchUsers(trimmedQuery)
            : await window.messagesBridge?.searchChats(trimmedQuery);

        if (cancelled) return;
        setResults(response?.items || []);
      } catch (error) {
        if (cancelled) return;
        setResults([]);
        setSearchError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [searchMode, trimmedQuery]);

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
      sx={{
        height: "100%",
        display: "flex",
        gap: 2,
        p: 2,
        alignItems: "stretch",
        minHeight: 0,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: 340,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: 2 }}>
          <Tabs
            value={searchMode}
            onChange={(_event, value: SearchMode) => setSearchMode(value)}
            variant="fullWidth"
            sx={{ minHeight: 40 }}
          >
            <Tab label="联系人" value="users" sx={{ minHeight: 40 }} />
            <Tab label="群聊" value="chats" sx={{ minHeight: 40 }} />
          </Tabs>

          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchMode === "users" ? "搜索联系人" : "搜索群聊"}
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

        {selectedConversation && (
          <>
            <Box sx={{ p: 2, pb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                当前会话
              </Typography>
            </Box>
            <List disablePadding sx={{ px: 1, pb: 1 }}>
              <ListItemButton selected sx={{ borderRadius: 2 }}>
                <ListItemAvatar>
                  <Avatar
                    src={selectedConversation.avatarUrl || fallbackAvatar}
                    alt={selectedConversation.title}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={selectedConversation.title}
                  secondary={
                    selectedConversation.type === "p2p" ? "私聊会话" : selectedConversation.subtitle || "群聊会话"
                  }
                  primaryTypographyProps={{ noWrap: true, fontWeight: 600 }}
                  secondaryTypographyProps={{ noWrap: true }}
                />
              </ListItemButton>
            </List>
            <Divider />
          </>
        )}

        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {trimmedQuery ? "搜索结果" : "消息入口"}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1, pb: 1 }}>
          {!trimmedQuery ? (
            <EmptyState
              title="搜索后查看消息"
              description={
                searchMode === "users"
                  ? "输入联系人姓名、邮箱或手机号后，可以直接进入私聊消息。"
                  : "输入群聊名称后，可以直接查看群消息。"
              }
            />
          ) : searchLoading ? (
            <Stack spacing={1} sx={{ p: 1 }}>
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" height={56} />
              ))}
            </Stack>
          ) : searchError ? (
            <Alert severity="error" sx={{ m: 1 }}>
              {searchError}
            </Alert>
          ) : results.length === 0 ? (
            <EmptyState title="没有找到结果" description="换个关键词试试，或者检查当前登录权限。" />
          ) : (
            <List disablePadding>
              {results.map((result) => (
                <ListItemButton
                  key={result.id}
                  onClick={() => void handleSelectConversation(result)}
                  selected={selectedConversation?.id === result.id}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemAvatar>
                    <Avatar src={result.avatarUrl || fallbackAvatar} alt={result.title} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={result.title}
                    secondary={result.subtitle || (result.type === "p2p" ? "联系人" : "群聊")}
                    primaryTypographyProps={{ noWrap: true, fontWeight: 600 }}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          borderRadius: 3,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!currentConversation ? (
          <EmptyState title="选择一个会话" description="从左侧搜索联系人或群聊，然后查看消息内容。" />
        ) : (
          <>
            <Box sx={{ px: 2.5, py: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
              <Avatar src={currentConversation.avatarUrl || fallbackAvatar} alt={currentConversation.title} />
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

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2.5 }}>
              {messagesError ? (
                <Alert severity="error">{messagesError}</Alert>
              ) : messagesLoading && messages.length === 0 ? (
                <Stack spacing={1.5}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} variant="rounded" height={84} />
                  ))}
                </Stack>
              ) : messages.length === 0 ? (
                <EmptyState title="暂无消息" description="这个会话里还没有可显示的消息内容。" />
              ) : (
                <Stack spacing={1.5}>
                  {hasMoreMessages && (
                    <Box sx={{ display: "flex", justifyContent: "center", pb: 1 }}>
                      <Button
                        variant="text"
                        onClick={() => void loadMessages(currentConversation, messagesPageToken)}
                        disabled={messagesLoading || !messagesPageToken}
                      >
                        {messagesLoading ? "加载中..." : "加载更多消息"}
                      </Button>
                    </Box>
                  )}

                  {messages.map((message) => (
                    <Paper
                      key={message.messageId}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2.5, bgcolor: "background.paper" }}
                    >
                      <Stack spacing={0.75}>
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
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}
