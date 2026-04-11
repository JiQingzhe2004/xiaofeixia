import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Cog,
  Copy,
  Circle,
  Database,
  Layers3,
  Laptop,
  Info,
  KeyRound,
  MonitorSmartphone,
  MoonStar,
  Palette,
  RefreshCw,
  Save,
  SunMedium,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Brand } from "../services/brandResolver";
import {
  beginDeviceAuth,
  fetchUserInfo,
  loginPollUntilComplete,
  type LoginPollStatusEvent,
} from "../services/userLoginService";
import { MESSAGE_FEATURE_SCOPES } from "../auth/messageFeatureScopes";
import type { UiPreferences } from "../types/uiPreferences";
import packageJson from "../../package.json";
import appIcon from "../../resources/icons/icon_1024.png";

interface Props {
  onReauthorized?: () => void | Promise<void>;
}

type SettingsSection = "root" | "account" | "appearance" | "about";

const SETTINGS_ITEMS: Array<{
  id: Exclude<SettingsSection, "root">;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    id: "account",
    label: "账号与授权",
    description: "管理消息页权限与授权状态",
    icon: ShieldCheck,
  },
  {
    id: "appearance",
    label: "外观",
    description: "主题和界面外观配置",
    icon: Palette,
  },
  {
    id: "about",
    label: "关于",
    description: "版本与应用信息",
    icon: Info,
  },
];

function formatScopeLabel(scope: string) {
  return scope.replace(/:/g, " / ");
}

function getThemeModeLabel(themeMode: "system" | "light" | "dark") {
  if (themeMode === "light") return "浅色模式";
  if (themeMode === "dark") return "深色模式";
  return "跟随系统";
}

function getPlatformLabel(platform?: string) {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "未知平台";
}

function formatDateTime(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SettingsPage({ onReauthorized }: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("root");
  const [loading, setLoading] = useState(false);
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">("system");
  const [savedThemeMode, setSavedThemeMode] = useState<"system" | "light" | "dark">("system");
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [loginPollStatus, setLoginPollStatus] = useState<LoginPollStatusEvent | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [appBrand, setAppBrand] = useState<string>("feishu");
  const [loginAt, setLoginAt] = useState<string>("");
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ignoreNextAuthWindowClosedRef = useRef(false);

  useEffect(() => {
    void loadGrantedScopes();
    void loadUiPreferences();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!window.authBridge?.onAuthWindowClosed) return;
    return window.authBridge.onAuthWindowClosed(() => {
      if (ignoreNextAuthWindowClosedRef.current) {
        ignoreNextAuthWindowClosedRef.current = false;
        return;
      }

      abortRef.current?.abort();
      setLoading(false);
      setError("你已关闭授权窗口，重新授权已取消。");
    });
  }, []);

  const missingScopes = useMemo(() => {
    const granted = new Set(grantedScopes);
    return MESSAGE_FEATURE_SCOPES.filter((scope) => !granted.has(scope));
  }, [grantedScopes]);

  const loadGrantedScopes = useCallback(async () => {
    const status = await window.configBridge?.getInitStatus();
    const scopeValue = String(status?.user?.scope || "");
    setAppBrand(String(status?.app?.brand || "feishu"));
    setLoginAt(String(status?.user?.loginAt || ""));
    setGrantedScopes(
      scopeValue
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }, []);

  const loadUiPreferences = useCallback(async () => {
    const preferences = await window.configBridge?.getUiPreferences();
    const nextThemeMode = preferences?.themeMode || "system";
    setThemeMode(nextThemeMode);
    setSavedThemeMode(nextThemeMode);
  }, []);

  const handleThemeModeChange = useCallback(
    (nextThemeMode: "system" | "light" | "dark") => {
      setThemeMode(nextThemeMode);
      window.dispatchEvent(
        new CustomEvent<UiPreferences>("ui-preferences-updated", {
          detail: { themeMode: nextThemeMode },
        })
      );
    },
    []
  );

  const hasUnsavedAppearanceChanges = themeMode !== savedThemeMode;

  const revertAppearancePreview = useCallback(() => {
    setThemeMode(savedThemeMode);
    window.dispatchEvent(
      new CustomEvent<UiPreferences>("ui-preferences-updated", {
        detail: { themeMode: savedThemeMode },
      })
    );
  }, [savedThemeMode]);

  const handleBackToRoot = useCallback(() => {
    if (activeSection === "appearance" && hasUnsavedAppearanceChanges) {
      revertAppearancePreview();
      setSuccessMessage("");
    }
    setActionMenuOpen(false);
    setActiveSection("root");
  }, [activeSection, hasUnsavedAppearanceChanges, revertAppearancePreview]);

  const handleSaveSettings = useCallback(async () => {
    setActionMenuOpen(false);
    setError("");

    if (activeSection === "appearance") {
      await window.configBridge?.saveUiPreferences({ themeMode });
      setSavedThemeMode(themeMode);
      setSuccessMessage("外观设置已保存。");
      return;
    }

    setSuccessMessage("当前没有需要保存的设置。");
  }, [activeSection, themeMode]);

  const handleCopyAboutInfo = useCallback(async () => {
    const content = [
      "肥猪",
      `版本：v${packageJson.version}`,
      `平台：${getPlatformLabel(window.appWindow?.platform)}`,
      `主题：${getThemeModeLabel(themeMode)}`,
      `接入品牌：${appBrand === "lark" ? "Lark" : "飞书"}`,
      `最近登录：${formatDateTime(loginAt)}`,
    ].join("\n");

    await navigator.clipboard.writeText(content);
    setSuccessMessage("版本信息已复制。");
  }, [appBrand, loginAt, themeMode]);

  const handleReauthorize = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccessMessage("");
    setLoginPollStatus(null);

    try {
      const appConfig = await window.configBridge?.getAppConfig();
      if (!appConfig?.clientId || !appConfig?.clientSecret) {
        throw new Error("未找到应用配置，请重新完成初始化。");
      }

      const brand = (appConfig.brand || "feishu") as Brand;
      const data = await beginDeviceAuth(
        appConfig.clientId,
        appConfig.clientSecret,
        brand,
        [...MESSAGE_FEATURE_SCOPES]
      );

      const authUrl = data.verificationUriComplete || data.verificationUri;
      if (!authUrl) {
        throw new Error("未获取到授权地址。");
      }

      await window.authBridge?.openAuthWindow(authUrl);

      abortRef.current = new AbortController();
      const tokenResult = await loginPollUntilComplete({
        deviceCode: data.deviceCode,
        appId: appConfig.clientId,
        appSecret: appConfig.clientSecret,
        brand,
        initialInterval: data.interval,
        onStatus: (status) => setLoginPollStatus(status),
        signal: abortRef.current.signal,
      });

      const userInfo = await fetchUserInfo(tokenResult.accessToken!, brand);

      await window.configBridge?.saveUserToken({
        accessToken: tokenResult.accessToken!,
        refreshToken: tokenResult.refreshToken,
        expiresIn: tokenResult.expiresIn,
        refreshTokenExpiresIn: tokenResult.refreshTokenExpiresIn,
        scope: tokenResult.scope,
        userInfo,
      });

      ignoreNextAuthWindowClosedRef.current = true;
      const closeResult = await window.authBridge?.closeAuthWindow();
      if (!closeResult?.closed) {
        ignoreNextAuthWindowClosedRef.current = false;
      }

      await loadGrantedScopes();
      await onReauthorized?.();
      setSuccessMessage("重新授权完成，当前登录权限已更新。");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("用户取消") ? "重新授权已取消。" : message);
    } finally {
      setLoading(false);
    }
  }, [loadGrantedScopes, onReauthorized]);

  const renderRootList = () => (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Box sx={{ px: 3, py: 2.5 }}>
        <Typography variant="h5" fontWeight={700} color="text.primary" gutterBottom>
          设置
        </Typography>
        <Typography variant="body2" color="text.secondary">
          选择一个设置项进入详情页。后续开关项、输入项、权限项都会统一从这里进入。
        </Typography>
      </Box>

      <Divider />

      <List disablePadding>
        {SETTINGS_ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <Box key={item.id}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => setActiveSection(item.id)}
                  sx={{ minHeight: 72, px: 2.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: "text.primary" }}>
                    <Icon size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={item.description}
                    primaryTypographyProps={{ fontWeight: 700, fontSize: "1rem" }}
                    secondaryTypographyProps={{ fontSize: "0.86rem" }}
                  />
                  <ChevronRight size={18} />
                </ListItemButton>
              </ListItem>
              {index < SETTINGS_ITEMS.length - 1 && <Divider />}
            </Box>
          );
        })}
      </List>
    </Paper>
  );

  const renderSectionShell = (
    title: string,
    description: string,
    content: React.ReactNode,
    icon: React.ReactNode
  ) => (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        sx={{ px: 3, py: 2.25 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            {icon}
            <Typography variant="h6" fontWeight={700}>
              {title}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </Stack>

      <Divider />
      {content}
    </Paper>
  );

  return (
    <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto" }}>
      {activeSection === "root" && renderRootList()}

      {activeSection === "account" &&
        renderSectionShell(
          "账号与授权",
          "使用当前应用配置重新拉起飞书用户授权，刷新消息页和联系人能力所需权限。",
          <List disablePadding>
            <ListItem
              sx={{
                px: 3,
                py: 2.25,
                display: "flex",
                justifyContent: "space-between",
                alignItems: { xs: "flex-start", sm: "center" },
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  重新授权
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  当消息页权限不足或需要补齐联系人能力时，从这里重新申请授权。
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={() => void handleReauthorize()}
                disabled={loading}
                startIcon={
                  loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />
                }
                sx={{ minWidth: 132, textTransform: "none", borderRadius: 999 }}
              >
                {loading ? "授权中..." : "重新授权"}
              </Button>
            </ListItem>

            <Divider />

            <ListItem sx={{ px: 3, py: 2, display: "block" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                授权状态
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  color={missingScopes.length === 0 ? "success" : "warning"}
                  label={missingScopes.length === 0 ? "消息权限完整" : `缺少 ${missingScopes.length} 项权限`}
                />
                {loading && loginPollStatus?.type && (
                  <Chip
                    size="small"
                    icon={<KeyRound size={14} />}
                    label={
                      loginPollStatus.type === "pending"
                        ? "等待飞书授权确认"
                        : loginPollStatus.type === "slow_down"
                          ? "授权轮询减速中"
                          : loginPollStatus.type === "success"
                            ? "授权成功"
                            : "授权处理中"
                    }
                  />
                )}
              </Stack>
            </ListItem>

            <Divider />

            <ListItem sx={{ px: 3, py: 2, display: "block" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                所需权限
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {MESSAGE_FEATURE_SCOPES.map((scope) => {
                  const granted = grantedScopes.includes(scope);
                  return (
                    <Chip
                      key={scope}
                      size="small"
                      icon={granted ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                      color={granted ? "success" : "default"}
                      variant={granted ? "filled" : "outlined"}
                      label={formatScopeLabel(scope)}
                    />
                  );
                })}
              </Stack>
            </ListItem>

            {(error || successMessage || missingScopes.length > 0) && <Divider />}

            {error && (
              <ListItem sx={{ px: 3, py: 2, display: "block" }}>
                <Alert severity="error">{error}</Alert>
              </ListItem>
            )}

            {successMessage && (
              <ListItem sx={{ px: 3, py: 2, display: "block" }}>
                <Alert severity="success">{successMessage}</Alert>
              </ListItem>
            )}

            {missingScopes.length > 0 && (
              <ListItem sx={{ px: 3, py: 2, display: "block" }}>
                <Alert severity="warning">
                  如果点击重新授权后权限仍补不齐，说明这些权限还没有在飞书开发者后台为当前应用开通。
                </Alert>
              </ListItem>
            )}
          </List>,
          <ShieldCheck size={18} />
        )}

      {activeSection === "appearance" &&
        renderSectionShell(
          "外观",
          "主题、字号、界面密度等外观配置后续会放在这里。",
          <List disablePadding>
            <ListItem
              disablePadding
              secondaryAction={
                <Chip
                  size="small"
                  label={
                    themeMode === "system"
                      ? "跟随系统"
                      : themeMode === "light"
                        ? "浅色"
                        : "深色"
                  }
                />
              }
            >
              <ListItemButton sx={{ px: 3, py: 2 }} disableRipple>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Palette size={18} />
                </ListItemIcon>
                <ListItemText
                  primary="主题模式"
                  secondary="控制整个应用使用浅色、深色，或跟随系统外观。"
                  primaryTypographyProps={{ fontWeight: 700 }}
                />
              </ListItemButton>
            </ListItem>

            <Divider />

            {[
              {
                value: "system" as const,
                title: "跟随系统",
                description: "自动跟随系统当前的浅色或深色模式。",
                icon: Laptop,
              },
              {
                value: "light" as const,
                title: "浅色模式",
                description: "始终使用浅色界面。",
                icon: SunMedium,
              },
              {
                value: "dark" as const,
                title: "深色模式",
                description: "始终使用深色界面。",
                icon: MoonStar,
              },
            ].map((item, index) => {
              const Icon = item.icon;
              const selected = themeMode === item.value;
              return (
                <Box key={item.value}>
                  <ListItem disablePadding>
                    <ListItemButton onClick={() => handleThemeModeChange(item.value)} sx={{ px: 3, py: 2 }}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Icon size={18} />
                      </ListItemIcon>
                      <ListItemText
                        primary={item.title}
                        secondary={item.description}
                        primaryTypographyProps={{ fontWeight: 700 }}
                      />
                      {selected && <CheckCircle2 size={18} />}
                      {!selected && <Circle size={18} />}
                    </ListItemButton>
                  </ListItem>
                  {index < 2 && <Divider />}
                </Box>
              );
            })}
          </List>,
          <Palette size={18} />
        )}

      {activeSection === "about" &&
        renderSectionShell(
          "关于",
          "查看应用版本、运行状态以及本地数据存储说明。",
          <List disablePadding>
            <ListItem sx={{ px: 3, py: 3, display: "block" }}>
              <Box
                sx={{
                  borderRadius: 3,
                  px: { xs: 2, sm: 2.5 },
                  py: 2.5,
                  border: "1px solid",
                  borderColor: "divider",
                  background:
                    "linear-gradient(135deg, rgba(255,179,107,0.08) 0%, rgba(255,95,143,0.04) 100%)",
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  justifyContent="space-between"
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ minWidth: 0, flex: 1 }}
                  >
                    <Box
                      component="img"
                      src={appIcon}
                      alt="肥猪应用图标"
                      sx={{
                        width: 68,
                        height: 68,
                        borderRadius: 2.5,
                        objectFit: "cover",
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="h5" fontWeight={800} color="text.primary">
                        肥猪
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        一个正在成形的桌面客户端，当前已经具备初始化、授权、消息探索和外观配置能力。
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                        <Chip label={`v${packageJson.version}`} color="primary" variant="outlined" size="small" />
                        <Chip label={getPlatformLabel(window.appWindow?.platform)} size="small" />
                        <Chip label={appBrand === "lark" ? "Lark" : "飞书"} size="small" />
                      </Stack>
                    </Box>
                  </Stack>

                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Copy size={16} />}
                    onClick={() => void handleCopyAboutInfo()}
                    sx={{
                      textTransform: "none",
                      borderRadius: 999,
                      flexShrink: 0,
                      alignSelf: { xs: "stretch", sm: "center" },
                      whiteSpace: "nowrap",
                      minWidth: { xs: "100%", sm: 148 },
                    }}
                  >
                    复制版本信息
                  </Button>
                </Stack>
              </Box>
            </ListItem>

            <Divider />

            <ListItem sx={{ px: 3, py: 2.25, display: "block" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                当前状态
              </Typography>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Palette size={16} />
                  <Typography variant="body2" color="text.secondary">
                    当前主题模式：{getThemeModeLabel(themeMode)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <MonitorSmartphone size={16} />
                  <Typography variant="body2" color="text.secondary">
                    当前运行平台：{getPlatformLabel(window.appWindow?.platform)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <ShieldCheck size={16} />
                  <Typography variant="body2" color="text.secondary">
                    当前接入品牌：{appBrand === "lark" ? "Lark" : "飞书"}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Info size={16} />
                  <Typography variant="body2" color="text.secondary">
                    最近登录时间：{formatDateTime(loginAt)}
                  </Typography>
                </Stack>
              </Stack>
            </ListItem>

            <Divider />

            <ListItem sx={{ px: 3, py: 2.25, display: "block" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                本地数据
              </Typography>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Database size={16} />
                  <Typography variant="body2" color="text.secondary">
                    当前应用配置、界面偏好和登录信息都保存在本地 SQLite 数据库中。
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  数据库文件名：`feizhu.db`
                </Typography>
              </Stack>
            </ListItem>
          </List>,
          <Info size={18} />
        )}

      <Backdrop
        open={actionMenuOpen}
        sx={{
          position: "absolute",
          zIndex: (theme) => theme.zIndex.speedDial - 1,
          backgroundColor: "rgba(0,0,0,0.12)",
        }}
      />

      <SpeedDial
        ariaLabel="设置页面快捷操作"
        sx={{
          position: "fixed",
          right: 24,
          bottom: 24,
          "& .MuiFab-primary": {
            bgcolor: (theme) =>
              theme.palette.mode === "dark" ? "grey.900" : "common.white",
            color: (theme) =>
              theme.palette.mode === "dark" ? "common.white" : "grey.900",
            boxShadow: (theme) =>
              theme.palette.mode === "dark"
                ? "0 10px 28px rgba(0,0,0,0.38)"
                : "0 10px 28px rgba(15,23,42,0.16)",
            "&:hover": {
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? "grey.800" : "grey.100",
            },
          },
          "& .MuiSpeedDialIcon-root": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
          "& .MuiSpeedDialIcon-icon": {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }}
        icon={<SpeedDialIcon icon={<Cog size={22} strokeWidth={2.1} />} openIcon={<Cog size={22} strokeWidth={2.1} />} />}
        onOpen={() => setActionMenuOpen(true)}
        onClose={() => setActionMenuOpen(false)}
        open={actionMenuOpen}
      >
        <SpeedDialAction
          icon={<Save size={18} />}
          tooltipTitle="保存"
          tooltipOpen
          onClick={() => void handleSaveSettings()}
          FabProps={{
            disabled: activeSection === "appearance" ? !hasUnsavedAppearanceChanges : false,
            sx: {
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? "grey.900" : "common.white",
              color: (theme) =>
                theme.palette.mode === "dark" ? "common.white" : "grey.900",
              boxShadow: (theme) =>
                theme.palette.mode === "dark"
                  ? "0 8px 22px rgba(0,0,0,0.34)"
                  : "0 8px 22px rgba(15,23,42,0.12)",
              "&:hover": {
                bgcolor: (theme) =>
                  theme.palette.mode === "dark" ? "grey.800" : "grey.100",
              },
            },
          }}
        />
        {activeSection !== "root" && (
          <SpeedDialAction
            icon={<ArrowLeft size={18} />}
            tooltipTitle="返回"
            tooltipOpen
            onClick={() => handleBackToRoot()}
            FabProps={{
              sx: {
                bgcolor: (theme) =>
                  theme.palette.mode === "dark" ? "grey.900" : "common.white",
                color: (theme) =>
                  theme.palette.mode === "dark" ? "common.white" : "grey.900",
                boxShadow: (theme) =>
                  theme.palette.mode === "dark"
                    ? "0 8px 22px rgba(0,0,0,0.34)"
                    : "0 8px 22px rgba(15,23,42,0.12)",
                "&:hover": {
                  bgcolor: (theme) =>
                    theme.palette.mode === "dark" ? "grey.800" : "grey.100",
                },
              },
            }}
          />
        )}
      </SpeedDial>
    </Box>
  );
}
