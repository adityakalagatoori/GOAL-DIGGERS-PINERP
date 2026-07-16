import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardFooter } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { AuthLayout } from '../../components/ui/AuthLayout';
import { login as loginApi, logout as logoutApi } from '../../api/authApi';
import { ApiError, extractApiErrorMessage } from '../../api/client';

export function AdminLogin() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      // Admin-ness is a property of the account, not a request flag — the
      // backend has one /api/auth/login endpoint for both; we just verify
      // the returned user is actually an Admin before letting them in here.
      const { user } = await loginApi(loginId, password);
      if (!user.isAdmin) {
        // The backend already set a valid session cookie for this account —
        // this form only gates the UI, not the credentials themselves — so a
        // non-admin must be explicitly logged out again rather than left
        // silently authenticated while the screen claims the login failed.
        await logoutApi();
        setError('This account is not a System Administrator. Use the regular login.');
        setIsLoggingIn(false);
        return;
      }
      login(user);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? extractApiErrorMessage(err) : 'Invalid Admin credentials');
      setIsLoggingIn(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex justify-center mb-6 lg:hidden">
        <Logo size={48} />
      </div>
      <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground mb-8">
        Admin Login
      </h2>

      <div>
        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-6">
              <Input
                label="Admin ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 rounded-lg">{error}</div>}

              <Button type="submit" className="w-full" size="lg">
                Sign In
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex-col gap-4 border-t border-border/50 bg-secondary/50 mt-4 rounded-b-xl">
            <div className="text-sm text-center w-full">
              <Link to="/login" className="text-primary hover:underline font-medium">
                Login as User
              </Link>
            </div>
            <div className="text-sm text-center w-full text-foreground/60">
              <Link to="/forgot-password" className="text-primary hover:underline font-medium">Forgot Password?</Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </AuthLayout>
  );
}
