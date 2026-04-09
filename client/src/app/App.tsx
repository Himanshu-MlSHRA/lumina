import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Layout from "../components/layout/Layout";
import AuthGuard from "../components/auth/AuthGuard";
import Dashboard from "../pages/Dashboard";
import Chat from "../pages/Chat";
import Games from "../pages/Games";
import Community from "../pages/Community";
import GroupChat from "../pages/GroupChat";
import DirectMessage from "../pages/DirectMessage";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import '@fortawesome/fontawesome-free/css/all.min.css';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/games" element={<Games />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/group/:groupId" element={<GroupChat />} />
          <Route path="/community/dm/:userId" element={<DirectMessage />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
