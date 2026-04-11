import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  BadgeInfo,
  ChevronRight,
  Home,
  LogOut,
  MessageCircle,
  Settings,
} from "lucide-react";
import { TITLEBAR_HEIGHT, WindowDragRegion } from "../components/windowChrome";
import feizhuLogo from "../../resources/icons/feizhu.png";
import feizhuIcon from "../../resources/icons/Avatar.png";
import packageJson from "../../package.json";
import SettingsPage from "../settings/SettingsPage";

const SIDEBAR_EXPANDED_WIDTH = 248;
const SIDEBAR_COLLAPSED_WIDTH = 76;
type MainSection = "home" | "settings";
type NavSection = MainSection | "messages";

const navItems: Array<{ id: NavSection; label: string; icon: typeof Home }> = [
  { id: "home", label: "首页", icon: Home },
  { id: "messages", label: "消息", icon: MessageCircle },
  { id: "settings", label: "设置", icon: Settings },
];

interface Props {
  userName?: string;
  avatarUrl?: string;
  onLogout?: () => void | Promise<void>;
  onReauthorized?: () => void | Promise<void>;
}

export default function MainPage({ userName, avatarUrl, onLogout, onReauthorized }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<MainSection>("home");
  const version = `v${packageJson.version}`;
  const displayName = userName?.trim() || "你";

  return (
    <>
      <WindowDragRegion />
      <Box
        sx={{
          height: "100vh",
          pt: window.appWindow?.customTitleBar ? `${TITLEBAR_HEIGHT}px` : 0,
          boxSizing: "border-box",
          bgcolor: "background.default",
          WebkitAppRegion: "no-drag",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            height: "100%",
            minHeight: 0,
          }}
        >
          <Paper
            component="aside"
            elevation={0}
            square
            sx={{
              position: "relative",
              width: collapsed
                ? SIDEBAR_COLLAPSED_WIDTH
                : SIDEBAR_EXPANDED_WIDTH,
              transition: "width 220ms ease",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              overflow: "visible",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              zIndex: 2,
              WebkitAppRegion: "no-drag",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: "50%",
                right: -1,
                transform: "translate(100%, -50%)",
                width: 30,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderTop: "1px solid",
                borderRight: "1px solid",
                borderBottom: "1px solid",
                borderColor: "divider",
                borderRadius: "0 999px 999px 0",
                bgcolor: "background.paper",
                zIndex: 3,
                boxSizing: "border-box",
              }}
            >
              <Tooltip title={collapsed ? "展开侧边栏" : "收起侧边栏"} placement="right">
                <IconButton
                  onClick={() => setCollapsed((value) => !value)}
                  size="small"
                  sx={{
                    width: 30,
                    height: 40,
                    borderRadius: "0 999px 999px 0",
                    color: "text.secondary",
                    WebkitAppRegion: "no-drag",
                    "& svg": {
                      transition: "transform 220ms ease",
                      transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                    },
                    "&:hover": {
                      bgcolor: "action.hover",
                      color: "text.primary",
                    },
                  }}
                >
                  <ChevronRight size={20} />
                </IconButton>
              </Tooltip>
            </Box>

            <Box
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                py: "6px",
              }}
            >
              <Box
                component="img"
                src={feizhuLogo}
                alt="肥猪 logo"
                sx={{
                  width: 44,
                  height: 44,
                  objectFit: "contain",
                  transform: "scaleX(-1)",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            </Box>

            <Box
              sx={{
                mx: 1.5,
                borderTop: "1px solid",
                borderColor: "divider",
                opacity: 0.7,
              }}
            />

            <List
              sx={{
                px: 1,
                py: 1,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Tooltip
                    key={item.label}
                    title={collapsed ? item.label : ""}
                    placement="right"
                    disableHoverListener={!collapsed}
                  >
                    <ListItemButton
                      selected={item.id === activeSection}
                      onClick={() => {
                        if (item.id === "messages") {
                          void window.appWindow?.openMessagesWindow();
                          return;
                        }
                        setActiveSection(item.id);
                      }}
                      sx={{
                        mb: 0.5,
                        minHeight: 44,
                        px: collapsed ? 1.25 : 1.5,
                        borderRadius: 2,
                        justifyContent: collapsed ? "center" : "flex-start",
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 0,
                          mr: collapsed ? 0 : 1.5,
                          justifyContent: "center",
                          color: "inherit",
                        }}
                      >
                        <Icon size={18} />
                      </ListItemIcon>
                      {!collapsed && <ListItemText primary={item.label} />}
                    </ListItemButton>
                  </Tooltip>
                );
              })}
            </List>

            <Box
              sx={{
                mx: 1.5,
                borderTop: "1px solid",
                borderColor: "divider",
                opacity: 0.7,
              }}
            />

            <Box
              sx={{
                px: collapsed ? 1 : 1.5,
                py: collapsed ? 1.5 : 1.25,
                display: "flex",
                flexDirection: collapsed ? "column" : "row",
                alignItems: "center",
                justifyContent: "center",
                gap: collapsed ? 1 : 1.25,
              }}
            >
              <Avatar
                src={avatarUrl || feizhuIcon}
                alt={avatarUrl ? `${displayName} 的头像` : "肥猪头像回退图"}
                sx={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: "background.default",
                  "& .MuiAvatar-img": {
                    objectFit: "cover",
                  },
                }}
              />
              {!collapsed && (
                <Typography
                  sx={{
                    minWidth: 0,
                    color: "text.primary",
                    fontSize: "20px",
                    fontWeight: 600,
                    lineHeight: 1.25,
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName}
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                px: collapsed ? 1 : 1.5,
                pb: 1.5,
                display: "flex",
                justifyContent: "center",
              }}
            >
              {collapsed ? (
                <Tooltip title="退出登录" placement="right">
                  <IconButton
                    onClick={() => void onLogout?.()}
                    size="small"
                    sx={{
                      color: "error.main",
                      WebkitAppRegion: "no-drag",
                      "&:hover": {
                        bgcolor: "error.main",
                        color: "error.contrastText",
                      },
                    }}
                  >
                    <LogOut size={16} />
                  </IconButton>
                </Tooltip>
              ) : (
                <Button
                  onClick={() => void onLogout?.()}
                  size="small"
                  startIcon={<LogOut size={16} />}
                  sx={{
                    minHeight: 32,
                    px: 1.5,
                    borderRadius: 999,
                    color: "error.main",
                    textTransform: "none",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    WebkitAppRegion: "no-drag",
                    "&:hover": {
                      bgcolor: "error.main",
                      color: "error.contrastText",
                    },
                  }}
                >
                  退出登录
                </Button>
              )}
            </Box>

            <Box
              sx={{
                mx: 1.5,
                borderTop: "1px solid",
                borderColor: "divider",
                opacity: 0.7,
              }}
            />

            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.625,
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                }}
              >
                <BadgeInfo size={14} />
                <Typography
                  variant="caption"
                  color="inherit"
                  sx={{ lineHeight: 1.2, fontSize: "0.8rem" }}
                >
                  {collapsed ? packageJson.version : version}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              bgcolor: "background.default",
              display: "flex",
              alignItems:
                activeSection === "home" ? "center" : "stretch",
              justifyContent:
                activeSection === "home" ? "center" : "stretch",
              overflow: "hidden",
              WebkitAppRegion: "no-drag",
            }}
          >
            {activeSection === "home" && (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 2,
                  px: 4,
                  overflowY: "auto",
                  transform: "translateY(-4%)",
                }}
              >
                <Box
                  component="img"
                  src={feizhuLogo}
                  alt="肥猪 logo"
                  sx={{
                    width: 200,
                    height: 200,
                    objectFit: "contain",
                    animation: "main-pig-wobble 3.6s ease-in-out infinite",
                    transformOrigin: "center bottom",
                    userSelect: "none",
                    pointerEvents: "none",
                    "@keyframes main-pig-wobble": {
                      "0%": {
                        transform: "rotate(0deg) translateY(0)",
                      },
                      "18%": {
                        transform: "rotate(-4deg) translateY(-2px)",
                      },
                      "36%": {
                        transform: "rotate(4deg) translateY(0)",
                      },
                      "54%": {
                        transform: "rotate(-3deg) translateY(-1px)",
                      },
                      "72%": {
                        transform: "rotate(3deg) translateY(0)",
                      },
                      "100%": {
                        transform: "rotate(0deg) translateY(0)",
                      },
                    },
                  }}
                />

                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color: "text.primary",
                    fontSize: { xs: "1.3rem", sm: "1.65rem" },
                    letterSpacing: "-0.02em",
                    lineHeight: 1.5,
                  }}
                >
                  可爱的
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      mx: 0.35,
                      fontFamily: "inherit",
                      fontWeight: 800,
                      letterSpacing: "0.01em",
                      background:
                        "linear-gradient(135deg, #ffb36b 0%, #ff7a59 55%, #ff5f8f 100%)",
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      color: "transparent",
                      WebkitTextFillColor: "transparent",
                      textShadow: "0 1px 8px rgba(255,122,89,0.1)",
                      position: "relative",
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        left: "6%",
                        right: "6%",
                        bottom: "0.08em",
                        height: "0.18em",
                        borderRadius: "999px",
                        background:
                          "linear-gradient(135deg, rgba(255,179,107,0.28) 0%, rgba(255,95,143,0.2) 100%)",
                        zIndex: -1,
                      },
                    }}
                  >
                    {displayName}
                  </Box>
                  小猪，准备好探险了吗？
                </Typography>
              </Box>
            )}

            {activeSection === "settings" && (
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  height: "100%",
                  overflowY: "auto",
                  px: 3,
                  py: 3,
                }}
              >
                <SettingsPage onReauthorized={onReauthorized} />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
}
