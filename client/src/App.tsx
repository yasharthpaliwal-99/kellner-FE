import { Routes, Route, Navigate } from "react-router-dom";
import KitchenApp from "./KitchenApp";
import GuestEntryPage from "./pages/GuestEntryPage";
import GuestVoicePage from "./pages/GuestVoicePage";
import LoginPage from "./LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/guest" element={<GuestEntryPage />} />
      <Route path="/guest/voice" element={<GuestVoicePage />} />
      <Route path="/kitchen" element={<KitchenApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
