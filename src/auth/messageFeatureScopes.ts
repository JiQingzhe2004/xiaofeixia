export const USER_MESSAGE_FEATURE_SCOPES = [
  "contact:user:search",
  "contact:contact.base:readonly",
  "contact:user.base:readonly",
  "contact:user.basic_profile:readonly",
  "im:chat:read",
  "search:message",
  "im:message.group_msg:get_as_user",
  "im:message.p2p_msg:get_as_user",
] as const;

export const APP_MESSAGE_FEATURE_SCOPES = [
  "im:chat:readonly",
  "im:chat.access_event.bot_p2p_chat:read",
  "im:message:receive_as_bot",
] as const;

export const MESSAGE_FEATURE_SCOPES = [
  ...USER_MESSAGE_FEATURE_SCOPES,
  ...APP_MESSAGE_FEATURE_SCOPES,
] as const;
