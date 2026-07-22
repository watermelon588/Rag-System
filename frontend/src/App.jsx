import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Search from './pages/Search';
import Login from './pages/Login';
import Register from './pages/Register';
import Terms from './pages/legal/Terms';
import Privacy from './pages/legal/Privacy';
import Documents from './pages/Documents';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import CustomCursor from './components/CustomCursor';
import AppBackground from './components/AppBackground';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* App-wide fixed video background + custom cursor, mounted once so
            they persist seamlessly across route transitions. */}
        <AppBackground />
        <CustomCursor />
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: 'var(--text)' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="/documents"
              element={<ProtectedRoute><Documents /></ProtectedRoute>}
            />
            <Route
              path="/chat"
              element={<ProtectedRoute><Chat /></ProtectedRoute>}
            />
            <Route
              path="/profile"
              element={<ProtectedRoute><Profile /></ProtectedRoute>}
            />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
