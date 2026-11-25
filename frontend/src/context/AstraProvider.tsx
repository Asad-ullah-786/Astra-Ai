import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AstraContext } from "./astra-context.ts";
import { isAssistantState } from "../lib/assistantState.ts";
import {
  ApiError,
  apiGet,
  clearAIModel as clearSelectedAIModel,
  createMemory as postMemory,
  createTask as postTask,
  deleteConversation as removeConversation,
  deleteMemory as removeMemory,
  deleteTask as removeTask,
  getTasks,
  getMemories,
  getAIStatus,
  saveSettings,
  saveLocalAICommand,
  saveAIModel,
  sessionSocketUrl,
  streamCommand,
  setApiToken,
  updateTask as patchTask,
  updateMemory as patchMemory,
} from "../services/api.ts";
import {
  chatWithLocalAI,
  getLocalAIClients,
  getLocalAIStatus,
  getLocalSystemSnapshot,
  hasLocalDeviceSession,
} from "../services/device.ts";
import type {
  AIStatus,
  ActivityItem,
  AstraTask,
  AssistantState,
  ChatMessage,
  CommandSendOptions,
  ConversationDetail,
  ConversationSummary,
  HealthResponse,
  ModuleInfo,
  MemoryInput,
  PersonalMemory,
  SettingsPayload,
  SystemSnapshot,
  TaskCreateInput,
  TaskUpdateInput,
} from "../types/index.ts";
import { parseDeviceIntent } from "../lib/deviceIntent.ts";
import { notifySuccess } from "../lib/notifications.ts";
import { launchLocalApplication, openLocalUrl } from "../services/device.ts";

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Guest access is required. Choose Continue as guest to create a private workspace.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "The local ASTRA service is not reachable.";
}

export function AstraProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [localClientAvailability, setLocalClientAvailability] = useState<Record<string, boolean> | null>(null);
  const [localAIStatus, setLocalAIStatus] = useState<Awaited<ReturnType<typeof getLocalAIStatus>> | null>(null);
  const [localSelectedModel, setLocalSelectedModel] = useState(() => sessionStorage.getItem("astra.localAIModel"));
  const [online, setOnline] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [state, setState] = useState<AssistantState>("idle");
  const [stats, setStats] = useState<SystemSnapshot | null>(null);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [tasks, setTasks] = useState<AstraTask[]>([]);
  const [memories, setMemories] = useState<PersonalMemory[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [tokenVersion, setTokenVersion] = useState(0);
  const activeIdRef = useRef<string | null>(null);
  const idleTimer = useRef<number | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    const detail = await apiGet<ConversationDetail>(`/api/v1/conversations/${id}`);
    activeIdRef.current = detail.id;
    setActiveConversationId(detail.id);
    setMessages(detail.messages);
  }, []);

  const refresh = useCallback(async () => {
    const [nextSettings, nextModules, nextActivities, nextConversations, nextTasks, nextAIStatus, nextMemories] = await Promise.all([
      apiGet<SettingsPayload>("/api/v1/settings"),
      apiGet<ModuleInfo[]>("/api/v1/modules"),
      apiGet<ActivityItem[]>("/api/v1/activity?limit=50"),
      apiGet<ConversationSummary[]>("/api/v1/conversations"),
      getTasks(),
      getAIStatus(),
      getMemories(),
    ]);
    setSettings(nextSettings);
    setModules(nextModules);
    setActivities(nextActivities);
    setActivityError(null);
    setConversations(nextConversations);
    setTasks(nextTasks);
    setMemories(nextMemories);
    setAIStatus(nextAIStatus);
    if (activeIdRef.current) {
      const stillThere = nextConversations.some((item) => item.id === activeIdRef.current);
      if (stillThere) {
        await loadConversation(activeIdRef.current);
      } else {
        activeIdRef.current = null;
        setActiveConversationId(null);
        setMessages([]);
      }
    }
    setConnectionError(null);
  }, [loadConversation]);

  const refreshTasks = useCallback(async () => {
    setTasks(await getTasks());
  }, []);

  const refreshAI = useCallback(async () => {
    const [nextAIStatus, deviceAI] = await Promise.all([
      getAIStatus(),
      health?.cloud_deployment && hasLocalDeviceSession() ? getLocalAIStatus() : Promise.resolve(null),
    ]);
    setAIStatus(nextAIStatus);
    setLocalAIStatus(deviceAI);
  }, [health?.cloud_deployment]);

  useEffect(() => {
    let stopped = false;
    let hasCheckedStatus = false;
    let wasOnline = false;
    const tick = async () => {
      try {
        const nextHealth = await apiGet<HealthResponse>("/api/v1/health");
        if (stopped) {
          return;
        }
        const recovered = hasCheckedStatus && !wasOnline && nextHealth.status === "online";
        wasOnline = nextHealth.status === "online";
        hasCheckedStatus = true;
        setHealth(nextHealth);
        setOnline(nextHealth.status === "online");

        try {
          if (nextHealth.cloud_deployment) {
            if (hasLocalDeviceSession()) {
              const [localStats, localClients, deviceAI] = await Promise.all([
                getLocalSystemSnapshot(),
                getLocalAIClients(),
                getLocalAIStatus(),
              ]);
              if (!stopped) {
                setStats(localStats);
                setLocalClientAvailability(localClients);
                setLocalAIStatus(deviceAI);
              }
            } else {
              if (!stopped) {
                setStats(null);
                setLocalClientAvailability(null);
                setLocalAIStatus(null);
              }
            }
          } else {
            const nextStats = await apiGet<SystemSnapshot>("/api/v1/system");
            if (!stopped) {
              setStats(nextStats);
              setLocalClientAvailability(null);
              setLocalAIStatus(null);
            }
          }
          if (!stopped) {
            setConnectionError((current) =>
              current?.startsWith("Guest access is required") ||
              current?.startsWith("This backend requires an API token.")
                ? current
                : null,
            );
          }
        } catch (error) {
          if (!stopped) {
            setStats(null);
            setLocalClientAvailability(null);
            setLocalAIStatus(null);
            setConnectionError(
              nextHealth.cloud_deployment
                ? "Start and pair the local ASTRA companion to view this device's CPU, RAM, and disk."
                : describe(error),
            );
          }
        }

        if (recovered) {
          void refresh().catch((error: unknown) => {
            if (!stopped) setConnectionError(describe(error));
          });
        }
      } catch (error) {
        if (!stopped) {
          hasCheckedStatus = true;
          wasOnline = false;
          setOnline(false);
          setHealth(null);
          setConnectionError(describe(error));
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [refresh, tokenVersion]);

  useEffect(() => {
    let stopped = false;
    const updateAIStatus = async () => {
      try {
        const [nextAIStatus, deviceAI] = await Promise.all([
          getAIStatus(),
          health?.cloud_deployment && hasLocalDeviceSession() ? getLocalAIStatus() : Promise.resolve(null),
        ]);
        if (!stopped) setLocalAIStatus(deviceAI);
        if (!stopped) setAIStatus(nextAIStatus);
      } catch (error) {
        if (!stopped) setConnectionError(describe(error));
      }
    };
    const id = window.setInterval(() => void updateAIStatus(), 30_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [health?.cloud_deployment, tokenVersion]);

  useEffect(() => {
    let stopped = false;
    const updateActivity = async () => {
      try {
        const nextActivities = await apiGet<ActivityItem[]>("/api/v1/activity?limit=50");
        if (!stopped) {
          setActivities(nextActivities);
          setActivityError(null);
        }
      } catch (error) {
        if (!stopped) setActivityError(describe(error));
      }
    };
    const id = window.setInterval(() => void updateActivity(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [tokenVersion]);

  useEffect(() => {
    let stopped = false;
    let retryTimer: number | null = null;
    const load = async () => {
      try {
        await refresh();
      } catch (error) {
        if (stopped) return;
        setConnectionError(describe(error));
        if (error instanceof ApiError && error.status < 500) return;
        retryTimer = window.setTimeout(() => void load(), 3000);
      }
    };
    void load();
    return () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [refresh, tokenVersion]);

  useEffect(() => {
    if (import.meta.env.PROD) {
      return;
    }

    let socket: WebSocket | null = null;
    let stopped = false;
    let retry = 0;

    const connect = () => {
      if (stopped) {
        return;
      }
      socket = new WebSocket(sessionSocketUrl());
      socket.onmessage = (event) => {
        const payload = JSON.parse(String(event.data)) as { type?: string; stats?: SystemSnapshot; state?: string };
        if (payload.type === "stats" && payload.stats) {
          setStats(payload.stats);
        }
        if (payload.type === "state" && payload.state && isAssistantState(payload.state)) {
          setState(payload.state);
        }
      };
      socket.onopen = () => {
        retry = 0;
      };
      socket.onclose = () => {
        if (!stopped) {
          retry = Math.min(retry + 1, 6);
          window.setTimeout(connect, retry * 1000);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      socket?.close();
    };
  }, [tokenVersion]);

  const send = useCallback(
    async (text: string, options?: CommandSendOptions) => {
      const cleaned = text.trim();
      if (!cleaned) {
        setCommandError("Enter a command before sending.");
        setState("error");
        return null;
      }
      if (idleTimer.current !== null) {
        window.clearTimeout(idleTimer.current);
      }
      setCommandError(null);
      setState("processing");
      try {
        const deviceIntent = parseDeviceIntent(cleaned);
        if (deviceIntent) {
          const createdAt = new Date().toISOString();
          const userMessage: ChatMessage = {
            id: `device-user-${Date.now()}`,
            role: "user",
            content: cleaned,
            created_at: createdAt,
          };
          setMessages((current) => [...current, userMessage]);
          const result = deviceIntent.action === "launch_app"
            ? await launchLocalApplication(deviceIntent.application)
            : await openLocalUrl(deviceIntent.url);
          const assistantMessage: ChatMessage = {
            id: `device-assistant-${Date.now()}`,
            role: "assistant",
            content: result.message,
            created_at: new Date().toISOString(),
          };
          setMessages((current) => [...current, assistantMessage]);
          setState("completed");
          idleTimer.current = window.setTimeout(() => setState("idle"), 1600);
          return assistantMessage;
        }

        if (health?.cloud_deployment && hasLocalDeviceSession() && localSelectedModel && localAIStatus?.connected) {
          const conversationHistory = [...messages, {
            id: `local-user-${Date.now()}`,
            role: "user",
            content: cleaned,
            created_at: new Date().toISOString(),
          }];
          const result = await chatWithLocalAI(
            localSelectedModel,
            conversationHistory
              .filter((message) => message.role === "user" || message.role === "assistant")
              .slice(-40)
              .map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
            options?.responseLanguage,
          );
          const saved = await saveLocalAICommand({
            text: cleaned,
            reply: result.reply,
            conversation_id: activeIdRef.current,
            model: localSelectedModel,
          });
          activeIdRef.current = saved.conversation_id;
          setActiveConversationId(saved.conversation_id);
          setMessages((current) => [...current, saved.user_message, saved.assistant_message]);
          setState("completed");
          await refresh();
          idleTimer.current = window.setTimeout(() => setState("idle"), 1600);
          return saved.assistant_message;
        }

        const streamingId = `stream-${Date.now()}`;
        let receivedMeta = false;
        let receivedDone = false;
        let completedMessage: ChatMessage | null = null;
        await streamCommand(cleaned, activeIdRef.current, (event) => {
          const conversationId = event.conversation_id;
          const userMessage = event.user_message;
          if (event.type === "meta" && conversationId && userMessage) {
            receivedMeta = true;
            activeIdRef.current = conversationId;
            setActiveConversationId(conversationId);
            setMessages((current) => [
              ...current,
              userMessage,
              {
                id: streamingId,
                role: "assistant",
                content: "",
                created_at: new Date().toISOString(),
              },
            ]);
            setState("thinking");
          } else if (event.type === "token" && event.content) {
            setState("speaking");
            options?.onToken?.(event.content);
            setMessages((current) =>
              current.map((message) =>
                message.id === streamingId ? { ...message, content: message.content + event.content } : message,
              ),
            );
          } else if (event.type === "done" && event.assistant_message) {
            const assistantMessage = event.assistant_message;
            receivedDone = true;
            completedMessage = assistantMessage;
            setMessages((current) =>
              current.map((message) => (message.id === streamingId ? assistantMessage : message)),
            );
          } else if (event.type === "error") {
            throw new Error(event.message ?? "The local AI response failed.");
          }
        }, options?.responseLanguage, options?.providerKey, options?.providerName);
        if (!receivedMeta) {
          throw new Error("ASTRA ended the response without starting the conversation.");
        }
        if (!receivedDone) {
          throw new Error("The local AI stream ended before ASTRA completed its reply.");
        }
        setState("completed");
        await refresh();
        idleTimer.current = window.setTimeout(() => setState("idle"), 1600);
        return completedMessage;
      } catch (error) {
        setState("error");
        setCommandError(describe(error));
        setMessages((current) => current.filter((message) => !message.id.startsWith("stream-") || message.content));
        return null;
      }
    },
    [health, localAIStatus, localSelectedModel, messages, refresh],
  );

  const openConversation = useCallback(
    async (id: string) => {
      setCommandError(null);
      await loadConversation(id);
    },
    [loadConversation],
  );

  const deleteConversation = useCallback(async (id: string) => {
    await removeConversation(id);
    if (activeIdRef.current === id) {
      activeIdRef.current = null;
      setActiveConversationId(null);
      setMessages([]);
      setCommandError(null);
    }
    await refresh();
    notifySuccess("Conversation deleted successfully.");
  }, [refresh]);

  const startNewConversation = useCallback(() => {
    activeIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    setCommandError(null);
    setState("idle");
  }, []);

  const deleteActiveConversation = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) {
      return;
    }
    await deleteConversation(id);
  }, [deleteConversation]);

  const saveDisplayName = useCallback(async (name: string) => {
    const saved = await saveSettings(name);
    setSettings(saved);
    notifySuccess("Display name saved successfully.");
  }, []);

  const selectAIModel = useCallback(async (model: string) => {
    if (health?.cloud_deployment && localAIStatus?.models.some((item) => item.name === model)) {
      sessionStorage.setItem("astra.localAIModel", model);
      setLocalSelectedModel(model);
      return;
    }
    setAIStatus(await saveAIModel(model));
    if (health?.cloud_deployment) {
      sessionStorage.removeItem("astra.localAIModel");
      setLocalSelectedModel(null);
    }
    await refresh();
  }, [health?.cloud_deployment, localAIStatus, refresh]);

  const clearAIModel = useCallback(async () => {
    sessionStorage.removeItem("astra.localAIModel");
    setLocalSelectedModel(null);
    setAIStatus(await clearSelectedAIModel());
    await refresh();
    notifySuccess("AI model selection cleared successfully.");
  }, [refresh]);

  const saveApiToken = useCallback((token: string) => {
    setApiToken(token);
    setTokenVersion((value) => value + 1);
  }, []);

  const createTaskItem = useCallback(async (task: TaskCreateInput) => {
    await postTask(task);
    await refresh();
    notifySuccess("Task created successfully.");
  }, [refresh]);

  const updateTaskItem = useCallback(async (taskId: string, updates: TaskUpdateInput) => {
    await patchTask(taskId, updates);
    await refresh();
    notifySuccess(
      updates.completed === true
        ? "Task completed successfully."
        : updates.completed === false
          ? "Task reopened successfully."
          : updates.in_progress !== undefined
            ? updates.in_progress ? "Task marked in progress successfully." : "Task progress updated successfully."
            : "Task updated successfully.",
    );
  }, [refresh]);

  const deleteTaskItem = useCallback(async (taskId: string) => {
    await removeTask(taskId);
    await refresh();
    notifySuccess("Task deleted successfully.");
  }, [refresh]);

  const createMemoryItem = useCallback(async (memory: MemoryInput) => {
    await postMemory(memory);
    await refresh();
    notifySuccess("Memory saved successfully.");
  }, [refresh]);

  const updateMemoryItem = useCallback(async (memoryId: string, memory: Partial<MemoryInput>) => {
    await patchMemory(memoryId, memory);
    await refresh();
    notifySuccess("Memory updated successfully.");
  }, [refresh]);

  const deleteMemoryItem = useCallback(async (memoryId: string) => {
    await removeMemory(memoryId);
    await refresh();
    notifySuccess("Memory deleted successfully.");
  }, [refresh]);

  const value = useMemo(
    () => ({
      health,
      aiStatus,
      localAIStatus,
      localSelectedModel,
      localClientAvailability,
      online,
      connectionError,
      activityError,
      commandError,
      state,
      stats,
      modules,
      activities,
      conversations,
      tasks,
      memories,
      activeConversationId,
      messages,
      settings,
      refresh,
      refreshTasks,
      createTask: createTaskItem,
      updateTask: updateTaskItem,
      deleteTask: deleteTaskItem,
      createMemory: createMemoryItem,
      updateMemory: updateMemoryItem,
      deleteMemory: deleteMemoryItem,
      refreshAI,
      selectAIModel,
      clearAIModel,
      sendCommand: send,
      openConversation,
      deleteConversation,
      startNewConversation,
      deleteActiveConversation,
      saveDisplayName,
      saveApiToken,
    }),
    [
      health,
      aiStatus,
      localAIStatus,
      localSelectedModel,
      localClientAvailability,
      online,
      connectionError,
      activityError,
      commandError,
      state,
      stats,
      modules,
      activities,
      conversations,
      tasks,
      memories,
      activeConversationId,
      messages,
      settings,
      refresh,
      refreshTasks,
      createTaskItem,
      updateTaskItem,
      deleteTaskItem,
      createMemoryItem,
      updateMemoryItem,
      deleteMemoryItem,
      refreshAI,
      selectAIModel,
      clearAIModel,
      send,
      openConversation,
      deleteConversation,
      startNewConversation,
      deleteActiveConversation,
      saveDisplayName,
      saveApiToken,
    ],
  );

  return <AstraContext.Provider value={value}>{children}</AstraContext.Provider>;
}
