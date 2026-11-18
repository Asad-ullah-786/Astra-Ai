import { Route, Routes } from "react-router";
import { AppShell } from "./layouts/AppShell.tsx";
import { ActivityPage } from "./pages/ActivityPage.tsx";
import { AgentsPage } from "./pages/AgentsPage.tsx";
import { AutomationPage } from "./pages/AutomationPage.tsx";
import { CalendarPage } from "./pages/CalendarPage.tsx";
import { ChatPage } from "./pages/ChatPage.tsx";
import { ConversationsPage } from "./pages/ConversationsPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { KnowledgePage } from "./pages/KnowledgePage.tsx";
import { MemoryPage } from "./pages/MemoryPage.tsx";
import { ResearchPage } from "./pages/ResearchPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { SkillsPage } from "./pages/SkillsPage.tsx";
import { SystemPage } from "./pages/SystemPage.tsx";
import { TasksPage } from "./pages/TasksPage.tsx";
import { VoicePage } from "./pages/VoicePage.tsx";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="voice" element={<VoicePage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="research" element={<ResearchPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
