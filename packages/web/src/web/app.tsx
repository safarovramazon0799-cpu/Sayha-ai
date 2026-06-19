import { Route, Switch } from "wouter";
import { Provider } from "./components/provider";
import { ProtectedRoute } from "./components/protected-route";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";

import LandingPage from "./pages/landing";
import SignInPage from "./pages/sign-in";
import SignUpPage from "./pages/sign-up";
import DashboardPage from "./pages/dashboard";
import ChatPage from "./pages/chat";
import ReviewPage from "./pages/review";
import DraftPage from "./pages/draft";
import HistoryPage from "./pages/history";
import AdminPage from "./pages/admin";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/sign-up" component={SignUpPage} />
        <Route path="/dashboard">
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        </Route>
        <Route path="/chat/:id?">
          <ProtectedRoute><ChatPage /></ProtectedRoute>
        </Route>
        <Route path="/review/:id?">
          <ProtectedRoute><ReviewPage /></ProtectedRoute>
        </Route>
        <Route path="/draft">
          <ProtectedRoute><DraftPage /></ProtectedRoute>
        </Route>
        <Route path="/history">
          <ProtectedRoute><HistoryPage /></ProtectedRoute>
        </Route>
        <Route path="/admin">
          <ProtectedRoute><AdminPage /></ProtectedRoute>
        </Route>
      </Switch>
      {import.meta.env.DEV && <AgentFeedback />}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
